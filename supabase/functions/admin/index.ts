// SIPE admin API. Auth: JWT + caller email in ADMIN_EMAILS.
// Deploy: supabase functions deploy admin
//
// Body { action }:
//   "overview"  -> headline counts for the admin dashboard
//   "feed"      -> all announcement rows (published + drafts), newest first
//   "send"      -> compose + send an email
//        { subject, body_md, cta_label?, cta_url?,
//          audience: "all" | "user", email?,          // "all" = product-news subscribers
//          post_to_feed?: boolean }                    // also publish to /whats-new (audience "all")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EMAIL, emailButton, emailShell, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Minimal markdown -> email HTML: headings, bold, italics, links, lists, paragraphs. */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" style="color:${EMAIL.brand}">$1</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return md.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    if (/^#{1,3}\s/.test(lines[0])) {
      const level = lines[0].match(/^#+/)![0].length;
      const size = level === 1 ? 20 : level === 2 ? 17 : 15;
      return `<h${level} style="margin:0 0 12px;font-size:${size}px;font-weight:700;color:${EMAIL.text}">${inline(lines[0].replace(/^#+\s/, ""))}</h${level}>`;
    }
    if (lines.every((l) => /^[-*]\s/.test(l))) {
      const items = lines.map((l) => `<li style="margin:0 0 4px">${inline(l.replace(/^[-*]\s/, ""))}</li>`).join("");
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:${EMAIL.textDim}">${items}</ul>`;
    }
    return `<p style="margin:0 0 16px;font-size:15px;color:${EMAIL.textDim}">${inline(block.replace(/\n/g, " "))}</p>`;
  }).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerEmail = (userData.user.email ?? "").toLowerCase();
    const callerIsAdmin = !!callerEmail && ADMIN_EMAILS.includes(callerEmail);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "").toString();

    // whoami is the only action a non-admin may call — it just reports the flag.
    if (action === "whoami") return json({ ok: true, admin: callerIsAdmin });
    if (!callerIsAdmin) return json({ error: "Forbidden" }, 403);

    const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    if (action === "overview") {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const [users, goals, accounts, subs, published, emails7d, notif7d] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("goals").select("id", { count: "exact", head: true }).eq("status", "active"),
        db.from("accounts").select("id", { count: "exact", head: true }).eq("archived", false),
        db.from("email_preferences").select("user_id", { count: "exact", head: true }).eq("announcements", true),
        db.from("announcements").select("id", { count: "exact", head: true }).not("published_at", "is", null),
        db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", since).eq("status", "sent"),
        db.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      return json({
        ok: true,
        stats: {
          users: users.count ?? 0,
          active_goals: goals.count ?? 0,
          accounts: accounts.count ?? 0,
          news_subscribers: subs.count ?? 0,
          announcements_published: published.count ?? 0,
          emails_sent_7d: emails7d.count ?? 0,
          notifications_7d: notif7d.count ?? 0,
        },
      });
    }

    if (action === "feed") {
      const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, announcements: data ?? [] });
    }

    if (action === "users") {
      const [{ data: profs, error: pErr }, { data: prefs }] = await Promise.all([
        db.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
        db.from("email_preferences").select("user_id, weekly_review, tips, announcements, goal_updates"),
      ]);
      if (pErr) return json({ error: pErr.message }, 500);
      const prefById = new Map((prefs ?? []).map((p) => [p.user_id, p]));
      const users = (profs ?? []).map((p) => {
        const pr = prefById.get(p.id);
        return {
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          created_at: p.created_at,
          subscribed: pr?.announcements !== false,
          email_prefs: pr
            ? { weekly_review: pr.weekly_review, tips: pr.tips, announcements: pr.announcements, goal_updates: pr.goal_updates }
            : null,
        };
      });
      return json({ ok: true, users });
    }

    if (action === "send") {
      if (!Deno.env.get("RESEND_API_KEY")) return json({ error: "RESEND_API_KEY not configured" }, 500);
      const subject = (body?.subject ?? "").toString().trim();
      const bodyMd = (body?.body_md ?? "").toString().trim();
      const ctaLabel = (body?.cta_label ?? "").toString().trim() || null;
      const ctaUrl = (body?.cta_url ?? "").toString().trim() || null;
      const audience = body?.audience === "user" ? "user" : "all";
      const postToFeed = !!body?.post_to_feed && audience === "all";
      if (!subject || !bodyMd) return json({ error: "Subject and body are required" }, 400);

      // Resolve recipients -> [{ user_id, email, unsub }]
      let recipients: { user_id: string; email: string; unsub: string | null }[] = [];
      if (audience === "user") {
        const email = (body?.email ?? "").toString().trim().toLowerCase();
        if (!email) return json({ error: "Recipient email required" }, 400);
        const { data: prof } = await db.from("profiles").select("id,email").ilike("email", email).maybeSingle();
        if (!prof) return json({ error: `No SIPE user with email ${email}` }, 404);
        const { data: pref } = await db.from("email_preferences").select("unsubscribe_token").eq("user_id", prof.id).maybeSingle();
        recipients = [{ user_id: prof.id, email: prof.email ?? email, unsub: pref?.unsubscribe_token ?? null }];
      } else {
        const { data: prefs, error: prefErr } = await db
          .from("email_preferences").select("user_id, unsubscribe_token").eq("announcements", true);
        if (prefErr) return json({ error: prefErr.message }, 500);
        const tokById = new Map((prefs ?? []).map((p) => [p.user_id as string, p.unsubscribe_token as string]));
        const ids = [...tokById.keys()];
        if (ids.length) {
          const { data: profs } = await db.from("profiles").select("id,email").in("id", ids);
          recipients = (profs ?? [])
            .filter((p) => p.email)
            .map((p) => ({ user_id: p.id as string, email: p.email as string, unsub: tokById.get(p.id as string) ?? null }));
        }
      }
      if (recipients.length === 0) return json({ ok: true, considered: 0, sent: 0, skipped: 0, failed: 0 });

      // Optionally publish to the /whats-new feed.
      let announcementId: string | null = null;
      if (postToFeed) {
        const { data: ann, error: annErr } = await db.from("announcements")
          .insert({ title: subject, body_md: bodyMd, cta_label: ctaLabel, cta_url: ctaUrl, published_at: new Date().toISOString() })
          .select().single();
        if (annErr) return json({ error: annErr.message }, 500);
        announcementId = ann.id;
      }

      const bodyHtml = renderMarkdown(bodyMd) + (ctaUrl ? emailButton(ctaLabel || "Learn more", ctaUrl) : "");
      const logKind = announcementId ? "announcement" : "admin_email";

      const results = { considered: 0, sent: 0, skipped: 0, failed: 0 };
      for (const r of recipients) {
        results.considered++;
        if (announcementId) {
          const { data: dupe } = await db.from("email_log").select("id")
            .eq("user_id", r.user_id).eq("kind", logKind).eq("ref_id", announcementId).limit(1).maybeSingle();
          if (dupe) { results.skipped++; continue; }
        }
        const html = emailShell({ heading: subject, bodyHtml, unsubscribeToken: r.unsub });
        const sent = await sendEmail({ to: r.email, subject, html });
        if (!sent.ok) { results.failed++; continue; }
        results.sent++;
        await db.from("email_log").insert({
          user_id: r.user_id, kind: logKind, ref_id: announcementId, resend_id: sent.id, status: "sent",
        });
        if (announcementId) {
          await db.from("notifications").insert({
            user_id: r.user_id, kind: "announcement", title: subject,
            body: ctaLabel || "New in SIPE", link: ctaUrl || "/whats-new", ref_id: announcementId,
          });
        }
      }
      return json({ ok: true, announcement_id: announcementId, ...results });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("admin error:", msg);
    return json({ error: msg }, 500);
  }
});
