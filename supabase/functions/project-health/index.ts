// Daily automatic baseline checks for launched projects.
// Deploy: supabase functions deploy project-health --no-verify-jwt
//
// Two ways in:
//   cron  header `x-cron-secret` == CRON_SECRET → every launched project with a URL
//   user  JWT + { project_id } → that one project ("Check now" on the Baseline tab),
//         at most once every 2 minutes per project
//
// What it checks (all from public information):
//   domain        RDAP renewal date (fail within 30 days)
//   uptime/https  the homepage loads, over HTTPS
//   email_domain  MX records (DNS over HTTPS)
//   title_meta, og_preview, schema, faq, analytics   in the homepage's raw HTML
//   sitemap, robots, llms_txt                       /sitemap.xml, /robots.txt, /llms.txt
//
// Safety: user-supplied addresses are only fetched if every resolved IP is public
// (no localhost, private ranges or cloud metadata), with at most 3 redirects, a
// 10-second timeout and a 2 MB read cap. A fetch that is blocked or refused is
// saved as "unknown" (couldn't check), never as a fail. Items the team marked
// "not for this project" are never overwritten.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

import { checkProject } from "../_shared/site-health.ts";

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------
async function runOne(db: SupabaseClient, project: { id: string; url: string }) {
  const { result, daysLeft, siteUp } = await checkProject(project.url);
  const { data: na } = await db.from("project_baseline_items").select("key").eq("project_id", project.id).eq("status", "na");
  const skip = new Set((na ?? []).map((r: { key: string }) => r.key));
  const now = new Date().toISOString();
  const rows = Object.entries(result)
    .filter(([key]) => !skip.has(key))
    .map(([key, v]) => ({ project_id: project.id, key, status: v.status, detail: v.detail, source: "auto", checked_at: now }));
  if (rows.length) await db.from("project_baseline_items").upsert(rows, { onConflict: "project_id,key" });

  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const metrics = [
    siteUp !== null && { project_id: project.id, metric: "site_up", on_date: today, value: siteUp, source: "auto", updated_at: now },
    daysLeft !== null && { project_id: project.id, metric: "domain_days_left", on_date: today, value: daysLeft, source: "auto", updated_at: now },
  ].filter(Boolean);
  if (metrics.length) await db.from("project_metrics").upsert(metrics, { onConflict: "project_id,metric,on_date" });
  return { project_id: project.id, checked: rows.length, failing: rows.filter((r) => r.status === "fail").map((r) => r.key) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    // ---- cron: everything
    if (req.headers.get("x-cron-secret")) {
      if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Forbidden" }, 403);
      const { data: projects, error } = await db.from("projects").select("id, url")
        .not("url", "is", null).is("killed_at", null).in("stage", ["launched", "growing", "sustaining"]);
      if (error) return json({ error: error.message }, 500);
      const out: unknown[] = [];
      const queue = [...(projects ?? [])];
      const worker = async () => {
        while (queue.length) {
          const p = queue.shift()!;
          try { out.push(await runOne(db, p as { id: string; url: string })); }
          catch (e) { out.push({ project_id: p.id, error: (e as Error).message }); }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return json({ ok: true, projects: out.length, results: out });
    }

    // ---- user: one project
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.project_id ?? "");
    const { data: member } = await db.from("project_members").select("role")
      .eq("project_id", projectId).eq("user_id", u.user.id).eq("status", "active").maybeSingle();
    if (!member || member.role === "viewer") return json({ error: "Project not found" }, 404);
    const { data: project } = await db.from("projects").select("id, url").eq("id", projectId).maybeSingle();
    if (!project?.url) return json({ error: "Add the project's web address first" }, 400);

    const { data: last } = await db.from("project_baseline_items").select("checked_at")
      .eq("project_id", projectId).eq("source", "auto").order("checked_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.checked_at && Date.now() - new Date(last.checked_at).getTime() < 120_000) {
      return json({ error: "Checked less than 2 minutes ago. Try again shortly." }, 429);
    }
    return json({ ok: true, ...(await runOne(db, project as { id: string; url: string })) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
