// Invite someone to a project's team, or resend an invite.
// Deploy: supabase functions deploy project-invite   (JWT required)
//
// Body: { project_id, email, role: "cofounder"|"contributor"|"viewer", share_pct? }
// The owner can invite any of those roles; a cofounder can invite contributors
// and viewers. Sends "<Name> invited you to <Project> on SIPE" via Resend and
// always returns the join link too, so it can be shared on WhatsApp if the
// email doesn't arrive. Accepting happens in the app (/join/:token →
// accept_project_invite), which checks the signed-in email matches.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { APP_URL, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLE_LABEL: Record<string, string> = { cofounder: "co-founder", contributor: "contributor", viewer: "viewer" };
const ROLE_LINE: Record<string, string> = {
  cofounder: "You'll be able to set goals with them, check in each week and see the project's numbers.",
  contributor: "You'll be able to check in each week, log your hours and see the goals and numbers.",
  viewer: "You'll be able to follow the goals, weekly check-ins and numbers.",
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function inviteEmail(inviter: string, project: string, oneLiner: string | null, role: string, link: string) {
  const subject = `${inviter} invited you to ${project} on SIPE`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
      <tr><td style="padding:28px 28px 8px;font-size:13px;font-weight:bold;color:#15803d">SIPE</td></tr>
      <tr><td style="padding:0 28px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 6px;font-size:20px;font-weight:bold;color:#0f172a">${esc(inviter)} invited you to ${esc(project)}</p>
        ${oneLiner ? `<p style="margin:0 0 16px;color:#6b7280">${esc(oneLiner)}</p>` : ""}
        <p style="margin:0 0 20px">You've been added as a <b>${esc(ROLE_LABEL[role] ?? role)}</b>. ${ROLE_LINE[role] ?? ""}</p>
        <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Join ${esc(project)}</a></p>
        <p style="margin:0;font-size:13px;color:#6b7280">You'll only see this project. Joining takes under a minute, with no password needed.</p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;max-width:520px">You're getting this because ${esc(inviter)} entered your email address. If you don't know them, you can ignore it.</p>
  </td></tr></table></body></html>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.project_id ?? "");
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "contributor");
    const shareRaw = body?.share_pct;
    const share = shareRaw === null || shareRaw === undefined || shareRaw === "" ? null : Number(shareRaw);
    if (!EMAIL_RE.test(email) || email.length > 200) return json({ error: "Enter a valid email address" }, 400);
    if (!["cofounder", "contributor", "viewer"].includes(role)) return json({ error: "Pick a role" }, 400);
    if (share !== null && (!Number.isFinite(share) || share < 0 || share > 100)) return json({ error: "Share must be between 0 and 100" }, 400);

    const { data: me } = await db.from("project_members").select("role")
      .eq("project_id", projectId).eq("user_id", u.user.id).eq("status", "active").maybeSingle();
    if (!me || (me.role !== "owner" && me.role !== "cofounder")) return json({ error: "Only the owner or a co-founder can invite people" }, 403);
    if (me.role === "cofounder" && role === "cofounder") return json({ error: "Only the owner can add co-founders" }, 403);

    const { data: project } = await db.from("projects").select("id, name, one_liner, killed_at").eq("id", projectId).maybeSingle();
    if (!project || project.killed_at) return json({ error: "Project not found" }, 404);

    // Keep invites sensible: 30 a day per project.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("project_members").select("id", { count: "exact", head: true })
      .eq("project_id", projectId).gte("created_at", since);
    if ((count ?? 0) >= 30) return json({ error: "That's a lot of invites for one day. Try again tomorrow." }, 429);

    const { data: existing } = await db.from("project_members").select("id, status, invite_token")
      .eq("project_id", projectId).eq("email", email).maybeSingle();
    if (existing?.status === "active") return json({ error: "They're already on the team" }, 409);

    let token: string;
    if (existing) {
      const patch: Record<string, unknown> = { role };
      if (me.role === "owner") patch.share_pct = share;
      await db.from("project_members").update(patch).eq("id", existing.id);
      token = existing.invite_token;
    } else {
      const { data: row, error } = await db.from("project_members").insert({
        project_id: projectId, email, role, status: "invited", mode: "parked",
        share_pct: me.role === "owner" ? share : null, invited_by: u.user.id,
      }).select("invite_token").single();
      if (error) return json({ error: error.message }, 500);
      token = row.invite_token;
    }

    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", u.user.id).maybeSingle();
    const inviter = profile?.full_name?.trim() || (profile?.email ?? u.user.email ?? "Someone").split("@")[0];
    const link = `${APP_URL}/join/${token}`;
    const { subject, html } = inviteEmail(inviter, project.name, project.one_liner, role, link);
    const sent = await sendEmail({ to: email, subject, html, replyTo: u.user.email ?? undefined });

    return json({ ok: true, emailed: sent.ok, token, link });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
