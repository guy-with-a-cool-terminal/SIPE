// Send a weekly financial summary email via Resend (user-initiated test button).
// Auth required (JWT). Deploy: supabase functions deploy weekly-review

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/email.ts";
import { buildWeeklyReview } from "../_shared/weekly-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!Deno.env.get("RESEND_API_KEY")) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;
    const userEmail = user.email!;

    const serviceClient = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const { data: prefs } = await serviceClient
      .from("email_preferences")
      .select("unsubscribe_token")
      .eq("user_id", user.id)
      .maybeSingle();

    const review = await buildWeeklyReview(serviceClient, {
      userId: user.id,
      email: userEmail,
      unsubscribeToken: prefs?.unsubscribe_token ?? null,
    });

    const sent = await sendEmail({ to: userEmail, subject: review.subject, html: review.html });
    if (!sent.ok) return json({ error: "Resend rejected the request", detail: sent.error }, 500);

    // Record the send (best-effort — user-initiated sends still log).
    await serviceClient.from("email_log").insert({
      user_id: user.id,
      kind: "weekly_review",
      ref_id: null,
      resend_id: sent.id,
      status: "sent",
    });

    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("weekly-review error:", msg);
    return json({ error: msg }, 500);
  }
});
