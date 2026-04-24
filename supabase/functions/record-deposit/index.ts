// Manually record an income deposit and auto-split into SIPE buckets.
// Auth required (JWT). Deploy: supabase functions deploy record-deposit

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    const source = (body?.source ?? "").toString().trim() || null;
    const category = (body?.category ?? "").toString().trim() || null;
    const note = (body?.note ?? "").toString().trim() || null;
    const occurredAt = body?.occurred_at ? new Date(body.occurred_at).toISOString() : new Date().toISOString();
    if (!amount || amount <= 0) return json({ error: "Invalid amount" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const { data: settings, error: setErr } = await admin
      .from("allocation_settings").select("*").eq("user_id", userId).maybeSingle();
    if (setErr || !settings) return json({ error: "No allocation settings" }, 500);

    const desc = note || (source ? `Deposit · ${source}` : "Manual deposit");

    const { data: parent, error: parErr } = await admin.from("transactions").insert({
      user_id: userId,
      type: "income",
      amount,
      description: desc,
      source,
      category,
      occurred_at: occurredAt,
    }).select().single();
    if (parErr) return json({ error: parErr.message }, 500);

    const splits = [
      { bucket: "S", pct: settings.savings_pct },
      { bucket: "I", pct: settings.invest_pct },
      { bucket: "P", pct: settings.pay_pct },
      { bucket: "E", pct: settings.expenses_pct },
    ];
    const allocations = splits.map(s => ({
      user_id: userId,
      type: "income" as const,
      bucket: s.bucket,
      amount: Number((amount * s.pct / 100).toFixed(2)),
      description: `Allocated to ${s.bucket}`,
      source,
      category,
      parent_id: parent.id,
      occurred_at: parent.occurred_at,
    }));
    const { error: allocErr } = await admin.from("transactions").insert(allocations);
    if (allocErr) return json({ error: allocErr.message }, 500);

    return json({ ok: true, parent_id: parent.id, amount });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
