// Push link: add numbers to one project from anywhere (your app, a daily script,
// Zapier, Make). Deploy: supabase functions deploy project-metrics --no-verify-jwt
//
// Auth: header `x-project-key: pk_...` (created in the project's Settings tab).
// Only the sha256 of the key is stored. A key can add numbers to its own
// project and nothing else: it can't read data or touch other projects.
//
// Body, one number:   { "metric": "signups", "value": 12, "date": "2026-11-18" }
// or several at once: { "metrics": [ { "metric": "visitors", "value": 340 }, ... ] }   (max 50)
// `date` is optional (defaults to today, Nairobi time). Sending the same metric
// and day again replaces the value, so retries are safe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-project-key",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const METRIC_RE = /^[a-z][a-z0-9_]{1,39}$/;
const RESERVED = new Set(["site_up", "domain_days_left"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nairobiToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const key = req.headers.get("x-project-key")?.trim();
    if (!key || !key.startsWith("pk_") || key.length > 100) return json({ error: "Missing or malformed x-project-key header" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: k } = await db.from("project_keys").select("id, project_id, revoked_at, last_used_at")
      .eq("key_hash", await sha256(key)).maybeSingle();
    if (!k || k.revoked_at) return json({ error: "Unknown or revoked key" }, 401);

    // Light throttle: one request every 2 seconds per key is plenty for daily numbers.
    if (k.last_used_at && Date.now() - new Date(k.last_used_at).getTime() < 2000) {
      return json({ error: "Too many requests. Send numbers at most every 2 seconds, or batch them with `metrics`." }, 429);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Body must be JSON" }, 400);
    const list: unknown[] = Array.isArray(body.metrics) ? body.metrics : [body];
    if (list.length === 0 || list.length > 50) return json({ error: "Send between 1 and 50 numbers" }, 400);

    const today = nairobiToday();
    const rows: { project_id: string; metric: string; on_date: string; value: number; source: string; updated_at: string }[] = [];
    for (const raw of list) {
      const m = raw as Record<string, unknown>;
      const metric = String(m?.metric ?? "").trim().toLowerCase();
      const value = Number(m?.value);
      const date = m?.date ? String(m.date).slice(0, 10) : today;
      if (!METRIC_RE.test(metric)) return json({ error: `Bad metric name "${metric}": use lowercase letters, numbers and _ (2-40 chars)` }, 400);
      if (RESERVED.has(metric)) return json({ error: `"${metric}" is written by SIPE itself` }, 400);
      if (!Number.isFinite(value) || Math.abs(value) > 1e12) return json({ error: `Bad value for ${metric}` }, 400);
      if (!DATE_RE.test(date) || date > today) return json({ error: `Bad date for ${metric}: use YYYY-MM-DD, not in the future` }, 400);
      rows.push({ project_id: k.project_id, metric, on_date: date, value, source: "push", updated_at: new Date().toISOString() });
    }

    // Last write wins inside one batch too.
    const unique = [...new Map(rows.map((r) => [`${r.metric}|${r.on_date}`, r])).values()];
    const { error } = await db.from("project_metrics").upsert(unique, { onConflict: "project_id,metric,on_date" });
    if (error) return json({ error: error.message }, 500);
    await db.from("project_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);

    return json({ ok: true, saved: unique.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
