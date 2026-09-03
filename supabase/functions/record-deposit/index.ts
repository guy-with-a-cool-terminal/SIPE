// Manually record an income deposit and auto-split into SIPE buckets.
// Auth required (JWT). Deploy: supabase functions deploy record-deposit

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET_ORDER = ["S", "I", "P", "E"] as const;

/** Split `amount` across active buckets; the last active bucket absorbs the rounding remainder. */
function splitDeposit(amount: number, pcts: Record<string, number>) {
  const active = BUCKET_ORDER.filter((b) => (pcts[b] ?? 0) > 0);
  const out: { bucket: string; amount: number }[] = [];
  let allocated = 0;
  active.forEach((b, i) => {
    const amt = i === active.length - 1
      ? Number((amount - allocated).toFixed(2))
      : Number((amount * pcts[b] / 100).toFixed(2));
    allocated += amt;
    out.push({ bucket: b, amount: amt });
  });
  return out;
}

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
    const accountIdRaw = (body?.account_id ?? "").toString().trim() || null;
    const occurredAt = body?.occurred_at ? new Date(body.occurred_at).toISOString() : new Date().toISOString();
    if (!amount || amount <= 0) return json({ error: "Invalid amount" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Validate the account belongs to this user (if supplied).
    let accountId: string | null = null;
    if (accountIdRaw) {
      const { data: acct } = await admin
        .from("accounts").select("id").eq("id", accountIdRaw).eq("user_id", userId).maybeSingle();
      if (!acct) return json({ error: "Account not found" }, 400);
      accountId = acct.id;
    }

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
      account_id: accountId,
      occurred_at: occurredAt,
    }).select().single();
    if (parErr) return json({ error: parErr.message }, 500);

    const pcts: Record<string, number> = {
      S: settings.savings_pct,
      I: settings.invest_pct,
      P: settings.pay_pct,
      E: settings.expenses_pct,
    };
    const allocations = splitDeposit(amount, pcts).map((s) => ({
      user_id: userId,
      type: "income" as const,
      bucket: s.bucket,
      amount: s.amount,
      description: `Allocated to ${s.bucket}`,
      source,
      category,
      account_id: accountId,
      parent_id: parent.id,
      occurred_at: parent.occurred_at,
    }));
    const { error: allocErr } = await admin.from("transactions").insert(allocations);
    if (allocErr) return json({ error: allocErr.message }, 500);

    // Auto-contribute to active deposit_pct goals.
    await contributeToGoals(admin, userId, amount, parent.id, parent.occurred_at);

    return json({ ok: true, parent_id: parent.id, amount, account_id: accountId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function contributeToGoals(
  admin: ReturnType<typeof createClient>,
  userId: string,
  depositTotal: number,
  transactionId: string,
  occurredAt: string,
) {
  const { data: goals } = await admin
    .from("goals")
    .select("id, deposit_pct")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("funding", "deposit_pct");
  if (!goals?.length) return;

  const rows = goals
    .filter((g: { deposit_pct: number | null }) => (g.deposit_pct ?? 0) > 0)
    .map((g: { id: string; deposit_pct: number }) => ({
      goal_id: g.id,
      user_id: userId,
      amount: Number((depositTotal * g.deposit_pct / 100).toFixed(2)),
      note: "Auto from deposit",
      auto: true,
      transaction_id: transactionId,
      occurred_at: occurredAt,
    }))
    .filter((r) => r.amount !== 0);
  if (rows.length) await admin.from("goal_contributions").insert(rows);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
