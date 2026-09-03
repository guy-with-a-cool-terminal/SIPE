// Paystack webhook -> auto-record payment + split into SIPE buckets
// Deploy: supabase functions deploy paystack-webhook --no-verify-jwt
// Secrets needed: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
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
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Missing env" }, 500);
    }

    // Each user gets a personalised webhook URL with their uid in the query string.
    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) return json({ error: "Missing uid in webhook URL" }, 400);

    const raw = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const expected = createHmac("sha512", PAYSTACK_SECRET).update(raw).digest("hex");
    if (signature !== expected) return json({ error: "Invalid signature" }, 401);

    const event = JSON.parse(raw);
    if (event.event !== "charge.success") return json({ ok: true, ignored: event.event });

    const data = event.data;
    const reference: string = data.reference;
    const amountKES: number = Number(data.amount) / 100;
    if (!reference || !amountKES) return json({ error: "Missing fields" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Idempotency
    const { data: existing } = await admin.from("transactions").select("id").eq("paystack_ref", reference).maybeSingle();
    if (existing) return json({ ok: true, deduped: true });

    // Get allocation settings (also validates the uid is a real user)
    const { data: settings, error: setErr } = await admin
      .from("allocation_settings").select("*").eq("user_id", uid).maybeSingle();
    if (setErr || !settings) return json({ error: "User not found" }, 404);

    // Route auto-recorded income to the user's default account (may be null).
    const { data: defaultAccount } = await admin
      .from("accounts").select("id").eq("user_id", uid).eq("is_default", true).maybeSingle();
    const accountId: string | null = defaultAccount?.id ?? null;

    // Optional: enrich with payment link name if we can find it
    const slug: string | undefined = data.source?.identifier || data.metadata?.payment_page_slug;
    const pageId: number | undefined = data.metadata?.payment_page != null
      ? Number(data.metadata.payment_page) : undefined;

    let paymentLinkId: string | null = null;
    let linkName: string | null = null;
    if (slug || pageId) {
      const q = admin.from("payment_links").select("id, name");
      const { data: link } = slug
        ? await q.eq("paystack_slug", slug).maybeSingle()
        : await q.eq("paystack_id", pageId!).maybeSingle();
      if (link) { paymentLinkId = link.id; linkName = link.name; }
    }

    const payerName =
      [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(" ").trim() ||
      data.customer?.email || "Client";
    const description = linkName ? `${linkName} · ${payerName}` : `Payment from ${payerName}`;

    // Parent income row
    const { data: parent, error: parErr } = await admin.from("transactions").insert({
      user_id: uid,
      type: "income",
      amount: amountKES,
      description,
      paystack_ref: reference,
      payment_link_id: paymentLinkId,
      account_id: accountId,
      source: data.customer?.email || null,
      occurred_at: new Date(data.paid_at || Date.now()).toISOString(),
    }).select().single();
    if (parErr) return json({ error: parErr.message }, 500);

    // Allocation rows
    const pcts: Record<string, number> = {
      S: settings.savings_pct,
      I: settings.invest_pct,
      P: settings.pay_pct,
      E: settings.expenses_pct,
    };
    const { error: allocErr } = await admin.from("transactions").insert(
      splitDeposit(amountKES, pcts).map((s) => ({
        user_id: uid,
        type: "income" as const,
        bucket: s.bucket,
        amount: s.amount,
        description: `Allocated to ${s.bucket}`,
        parent_id: parent.id,
        payment_link_id: paymentLinkId,
        account_id: accountId,
        occurred_at: parent.occurred_at,
      })),
    );
    if (allocErr) return json({ error: allocErr.message }, 500);

    // Auto-contribute to active deposit_pct goals.
    const { data: goals } = await admin
      .from("goals")
      .select("id, deposit_pct")
      .eq("user_id", uid)
      .eq("status", "active")
      .eq("funding", "deposit_pct");
    const gcRows = (goals ?? [])
      .filter((g: { deposit_pct: number | null }) => (g.deposit_pct ?? 0) > 0)
      .map((g: { id: string; deposit_pct: number }) => ({
        goal_id: g.id,
        user_id: uid,
        amount: Number((amountKES * g.deposit_pct / 100).toFixed(2)),
        note: "Auto from deposit",
        auto: true,
        transaction_id: parent.id,
        occurred_at: parent.occurred_at,
      }))
      .filter((r) => r.amount !== 0);
    if (gcRows.length) await admin.from("goal_contributions").insert(gcRows);

    return json({ ok: true, allocated: amountKES, account_id: accountId });
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
