// Create a Paystack Payment Page for a customer to pay.
// Auth required. Stores the link in payment_links table.
// Deploy: supabase functions deploy create-payment-link

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
    const PAYSTACK_SECRET = normalizeSecret(
      Deno.env.get("PAYSTACK_SECRET_KEY") ?? Deno.env.get("PAYSTACK_SECRET"),
    );
    if (!PAYSTACK_SECRET) return json({ error: "PAYSTACK_SECRET_KEY missing" }, 500);
    if (!/^sk_(test|live)_/i.test(PAYSTACK_SECRET)) {
      return json({
        error: "Invalid Paystack secret configuration",
        details: "Expected a Secret Key starting with sk_test_ or sk_live_",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const ownerEmail = userData.user.email ?? "";

    const body = await req.json().catch(() => null);
    const name = (body?.name ?? "").toString().trim();
    const description = (body?.description ?? "").toString().trim() || null;
    const amount = Number(body?.amount);
    if (!name || !amount || amount <= 0) return json({ error: "name and positive amount required" }, 400);

    // Create Paystack Payment Page
    // https://paystack.com/docs/api/page/
    const psRes = await fetch("https://api.paystack.co/page", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        amount: Math.round(amount * 100), // Paystack expects subunits
        currency: "KES",
        fixed_amount: true,
        type: "payment",
        metadata: { sipe_user_id: userId, sipe_owner_email: ownerEmail },
      }),
    });
    const psBody = await psRes.json();
    if (!psRes.ok || !psBody?.status) {
      console.error("Paystack page creation failed", {
        status: psRes.status,
        message: psBody?.message,
        code: psBody?.code,
        type: psBody?.type,
        keyPrefix: PAYSTACK_SECRET.slice(0, 7),
        keyLength: PAYSTACK_SECRET.length,
      });

      const isInvalidKey = /invalid key/i.test(psBody?.message || "") || psBody?.code === "invalid_Key";
      return json({
        error: isInvalidKey ? "Paystack rejected the configured secret key" : (psBody?.message || "Paystack error"),
        details: {
          status: psRes.status,
          message: psBody?.message || null,
          code: psBody?.code || null,
          type: psBody?.type || null,
        },
      }, 502);
    }

    const slug: string = psBody.data.slug;
    const pageId: number = psBody.data.id;
    // Pre-fill owner email so the webhook can match the payment to this account
    const url = `https://paystack.com/pay/${slug}?email=${encodeURIComponent(ownerEmail)}`;

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { data, error } = await admin.from("payment_links").insert({
      user_id: userId,
      name,
      description,
      amount,
      paystack_slug: slug,
      paystack_url: url,
      paystack_id: pageId,
    }).select().single();
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, link: data });
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

function normalizeSecret(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().replace(/^['\"]|['\"]$/g, "");
}
