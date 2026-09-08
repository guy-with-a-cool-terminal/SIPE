// Public email-preference / unsubscribe page. No auth beyond the token.
// Deploy: supabase functions deploy unsubscribe --no-verify-jwt
//
// GET  /functions/v1/unsubscribe?token=<uuid>  → a small styled page with a
//      checkbox per email list (pre-checked to the user's current prefs) plus a
//      one-click "Unsubscribe from everything" button.
// POST same URL (form-encoded, token in the query or the body) → saves the
//      chosen prefs and shows a confirmation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LISTS: { key: string; label: string; blurb: string }[] = [
  { key: "weekly_review", label: "Weekly review", blurb: "Your Monday money summary." },
  { key: "tips", label: "Money tips", blurb: "A short freelancing-finance tip each week." },
  { key: "announcements", label: "Product news", blurb: "New SIPE features and changes." },
  { key: "goal_updates", label: "Goal updates", blurb: "Milestones and behind-schedule nudges." },
];

const page = (title: string, inner: string, status = 200) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · SIPE</title></head>
<body style="margin:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0">
<div style="max-width:460px;margin:48px auto;padding:0 20px">
  <div style="text-align:center;padding-bottom:20px">
    <img src="https://sipe.cnbcode.com/logo.png" width="40" height="40" alt="SIPE" style="vertical-align:middle;border:0">
    <span style="vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;color:#e2e8f0">SIPE</span>
  </div>
  <div style="background:#131c31;border:1px solid #25304a;border-radius:16px;overflow:hidden">
    <div style="padding:24px 32px 4px">
      <h1 style="margin:0;font-size:20px;color:#e2e8f0">${title}</h1>
    </div>
    <div style="padding:16px 32px 28px">${inner}</div>
  </div>
  <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#64748b">
    <a href="https://sipe.cnbcode.com" style="color:#64748b">sipe.cnbcode.com</a>
  </p>
</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let token = (url.searchParams.get("token") ?? "").trim();
  let form: URLSearchParams | null = null;
  if (req.method === "POST") {
    form = new URLSearchParams(await req.text().catch(() => ""));
    if (!token) token = (form.get("token") ?? "").trim();
  }

  if (!token) {
    return page("Link expired", `<p style="margin:0;font-size:14px;color:#94a3b8">This unsubscribe link is missing its token. Open the link straight from your email, or manage email settings in the SIPE app.</p>`, 400);
  }

  const { data: prefs, error } = await db
    .from("email_preferences")
    .select("user_id, weekly_review, tips, announcements, goal_updates")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error || !prefs) {
    return page("Link not recognised", `<p style="margin:0;font-size:14px;color:#94a3b8">We couldn't match this unsubscribe link to an account. It may have already been used to rotate the token. Manage email settings in the SIPE app instead.</p>`, 404);
  }

  if (req.method === "POST") {
    const unsubAll = form?.get("all") === "1";
    const patch: Record<string, boolean> = {};
    for (const l of LISTS) patch[l.key] = unsubAll ? false : form?.get(l.key) === "on";
    const { error: upErr } = await db
      .from("email_preferences")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", prefs.user_id);
    if (upErr) {
      return page("Something went wrong", `<p style="margin:0;font-size:14px;color:#94a3b8">We couldn't save that just now. Please try again in a minute.</p>`, 500);
    }
    const on = LISTS.filter((l) => patch[l.key]).map((l) => l.label);
    const summary = on.length
      ? `You'll still get: <strong style="color:#e2e8f0">${on.join(", ")}</strong>.`
      : `You're unsubscribed from all SIPE emails.`;
    return page("Preferences saved", `<p style="margin:0 0 14px;font-size:14px;color:#22c55e">Your email preferences have been updated.</p><p style="margin:0;font-size:14px;color:#94a3b8">${summary} You can change this any time in Settings → Email.</p>`);
  }

  // GET → render the form.
  const rows = LISTS.map((l) => {
    const checked = (prefs as Record<string, unknown>)[l.key] ? "checked" : "";
    return `<label style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #25304a;cursor:pointer">
      <input type="checkbox" name="${l.key}" ${checked} style="margin-top:3px;width:16px;height:16px;accent-color:#0284c7">
      <span><span style="font-size:14px;font-weight:600">${l.label}</span><br>
      <span style="font-size:12px;color:#94a3b8">${l.blurb}</span></span>
    </label>`;
  }).join("");

  const action = `${SUPABASE_URL}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
  const inner = `
    <p style="margin:0 0 16px;font-size:14px;color:#94a3b8">Choose which SIPE emails you want to keep receiving.</p>
    <form method="POST" action="${action}">
      ${rows}
      <button type="submit" style="margin-top:20px;width:100%;background:#0284c7;color:#fff;border:0;border-radius:999px;padding:11px;font-size:14px;font-weight:600;cursor:pointer">Save preferences</button>
    </form>
    <form method="POST" action="${action}" style="margin-top:10px">
      <input type="hidden" name="all" value="1">
      <button type="submit" style="width:100%;background:transparent;color:#94a3b8;border:1px solid #25304a;border-radius:999px;padding:10px;font-size:13px;cursor:pointer">Unsubscribe from everything</button>
    </form>`;
  return page("Email preferences", inner);
});
