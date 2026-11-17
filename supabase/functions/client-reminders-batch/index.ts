// Cron-driven payment reminders to clients, for users who turned on
// Settings › Business › "Email payment reminders to clients".
// Deploy: supabase functions deploy client-reminders-batch --no-verify-jwt
// Gate: header `x-cron-secret` must equal the CRON_SECRET env var. Run once a day.
//
// Stages per unpaid invoice: 2 days before the due date, then 1, 7 and 14 days
// after it. Each stage goes out once (email_log kind `client_reminder_<stage>`,
// ref_id = document id, unique per user). Only the most recent stage that is due
// is sent, so an invoice found late doesn't get a burst of catch-up emails.
// Replies go to the business's own email. The user gets an in-app notification.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { APP_URL, sendEmail } from "../_shared/email.ts";
import { formatKES } from "../_shared/kes.ts";
import { clientLabel, daysBetween, loadOpenDocuments, type OpenInvoice } from "../_shared/client-attention.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** days relative to the due date: negative = before it. */
const STAGES = [
  { key: "before", at: -2 },
  { key: "late1", at: 1 },
  { key: "late7", at: 7 },
  { key: "late14", at: 14 },
] as const;

interface Profile {
  user_id: string;
  legal_name: string | null;
  trading_name: string | null;
  email: string | null;
  phone: string | null;
  brand_color: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A light, plain email in the business's colour. It comes from them, not from SIPE. */
function reminderEmail(p: Profile, doc: OpenInvoice, stage: string, balance: number, contact: string) {
  const business = esc(p.trading_name?.trim() || p.legal_name?.trim() || "Your supplier");
  const brand = /^#[0-9a-f]{6}$/i.test(p.brand_color ?? "") ? p.brand_color! : "#15803d";
  const due = fmtDate(doc.due_date!);
  const first = esc(contact.trim().split(/\s+/)[0] || "there");
  const ref = esc(doc.number ?? "your invoice");
  const line = stage === "before"
    ? `A friendly reminder that invoice ${ref} for ${formatKES(balance)} is due on ${due}.`
    : `Invoice ${ref} for ${formatKES(balance)} was due on ${due} and is still open. If you have already paid, thank you, and please ignore this note. Otherwise, could you let us know when to expect payment?`;
  const subject = stage === "before" ? `${doc.number} is due on ${due}` : `Reminder: ${doc.number} is overdue`;
  const link = `${APP_URL}/d/${doc.public_token}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
      <tr><td style="background:${brand};color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:16px;font-weight:bold">${business}</td></tr>
      <tr><td style="padding:24px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 14px">Hi ${first},</p>
        <p style="margin:0 0 20px">${line}</p>
        <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:999px">View invoice ${ref}</a></p>
        <p style="margin:0">Thank you,<br>${business}${p.phone ? `<br><span style="color:#6b7280;font-size:13px">${esc(p.phone)}</span>` : ""}</p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#9ca3af">Sent on behalf of ${business}. Reply to this email to reach them.</p>
  </td></tr></table></body></html>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (!CRON_SECRET) return json({ error: "CRON_SECRET not configured" }, 500);
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Forbidden" }, 403);
    if (!Deno.env.get("RESEND_API_KEY")) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Nairobi date

    const { data: profiles, error } = await db
      .from("business_profiles").select("user_id,legal_name,trading_name,email,phone,brand_color").eq("auto_reminders", true);
    if (error) return json({ error: error.message }, 500);

    const results = { users: 0, sent: 0, skipped: 0, failed: 0 };
    for (const p of (profiles ?? []) as Profile[]) {
      results.users++;
      const docs = (await loadOpenDocuments(db, p.user_id)).filter((d) => d.kind === "invoice" && d.status === "sent" && d.due_date);
      if (!docs.length) continue;

      const { data: clients } = await db.from("clients").select("id,name,company,email").eq("user_id", p.user_id);
      const byId = new Map((clients ?? []).map((c: { id: string }) => [c.id, c]));

      for (const doc of docs) {
        const balance = Math.max(0, Number(doc.total) - Number(doc.amount_paid));
        if (balance <= 0) continue;
        const offset = daysBetween(doc.due_date!, today); // days after due
        const stage = [...STAGES].reverse().find((s) => offset >= s.at);
        if (!stage || (stage.key === "before" && offset >= 0)) continue; // "before" only while still before due

        const live = doc.client_id ? byId.get(doc.client_id) as { name?: string; company?: string | null; email?: string | null } | undefined : undefined;
        const to = live?.email || doc.client_snapshot?.email;
        if (!to) { results.skipped++; continue; }

        const kind = `client_reminder_${stage.key}`;
        const { data: already } = await db.from("email_log").select("id")
          .eq("user_id", p.user_id).eq("kind", kind).eq("ref_id", doc.id).limit(1).maybeSingle();
        if (already) { results.skipped++; continue; }

        const contact = live?.name || doc.client_snapshot?.name || "";
        const { subject, html } = reminderEmail(p, doc, stage.key, balance, contact);
        const business = p.trading_name?.trim() || p.legal_name?.trim() || "SIPE";
        const sent = await sendEmail({
          to, subject, html,
          from: `${business.replace(/[<>"]/g, "")} via SIPE <noreply@cnbcode.com>`,
          replyTo: p.email ?? undefined,
        });
        // A failure isn't logged, so tomorrow's run tries again.
        if (!sent.ok) { results.failed++; console.error("reminder failed", doc.id, sent.error); continue; }
        await db.from("email_log").insert({ user_id: p.user_id, kind, ref_id: doc.id, resend_id: sent.id, status: "sent" });
        results.sent++;
        await db.from("notifications").insert({
          user_id: p.user_id, kind: "client_reminder",
          title: `Reminder sent to ${clientLabel(live ?? doc.client_snapshot)}`,
          body: `${doc.number} · ${formatKES(balance)} ${stage.key === "before" ? "due soon" : "overdue"}`,
          link: `/invoices/${doc.id}`, ref_id: doc.id,
        });
      }
    }
    return json({ ok: true, ...results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("client-reminders-batch error:", msg);
    return json({ error: msg }, 500);
  }
});
