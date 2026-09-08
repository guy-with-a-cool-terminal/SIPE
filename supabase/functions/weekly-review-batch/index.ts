// Cron-driven weekly summary email for every opted-in user.
// Deploy: supabase functions deploy weekly-review-batch --no-verify-jwt
// Gate: header `x-cron-secret` must equal the CRON_SECRET env var.
// Idempotent within a calendar week via the email_log table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/email.ts";
import { weekBounds } from "../_shared/week.ts";
import { buildWeeklyReview, type GoalEvent } from "../_shared/weekly-review.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!CRON_SECRET) return json({ error: "CRON_SECRET not configured" }, 500);
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Forbidden" }, 403);
    if (!Deno.env.get("RESEND_API_KEY")) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const now = new Date();
    const { thisMonday } = weekBounds(now);

    const { data: prefs, error: prefErr } = await db
      .from("email_preferences")
      .select("user_id, unsubscribe_token, goal_updates")
      .eq("weekly_review", true);
    if (prefErr) return json({ error: prefErr.message }, 500);

    const results = { considered: 0, sent: 0, skipped: 0, failed: 0 };

    for (const pref of prefs ?? []) {
      results.considered++;
      const userId = pref.user_id as string;

      // Idempotency: already sent this calendar week?
      const { data: already } = await db
        .from("email_log")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "weekly_review")
        .eq("status", "sent")
        .gte("sent_at", thisMonday.toISOString())
        .limit(1)
        .maybeSingle();
      if (already) { results.skipped++; continue; }

      // Need an email address — look it up via auth admin.
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) { results.skipped++; continue; }

      let review;
      try {
        review = await buildWeeklyReview(db, {
          userId,
          email,
          now,
          unsubscribeToken: pref.unsubscribe_token ?? null,
        });
      } catch (e) {
        console.error("build failed for", userId, (e as Error).message);
        results.failed++;
        continue;
      }

      const sent = await sendEmail({ to: email, subject: review.subject, html: review.html });
      if (!sent.ok) {
        results.failed++;
        await db.from("email_log").insert({
          user_id: userId, kind: "weekly_review", ref_id: null, status: "failed",
        });
        continue;
      }

      await db.from("email_log").insert({
        user_id: userId, kind: "weekly_review", ref_id: null, resend_id: sent.id, status: "sent",
      });
      results.sent++;

      if (pref.goal_updates !== false) {
        await writeGoalNotifications(db, userId, review.goalEvents, thisMonday);
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("weekly-review-batch error:", msg);
    return json({ error: msg }, 500);
  }
});

/** Best-effort: one notification per goal event, deduped within the current week. */
async function writeGoalNotifications(
  db: ReturnType<typeof createClient>,
  userId: string,
  events: GoalEvent[],
  weekStart: Date,
) {
  for (const ev of events) {
    try {
      const { data: dupe } = await db
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", ev.kind)
        .eq("ref_id", ev.goal_id)
        .gte("created_at", weekStart.toISOString())
        .limit(1)
        .maybeSingle();
      if (dupe) continue;

      const title = ev.kind === "goal_milestone"
        ? `${ev.name} hit ${ev.milestone}%`
        : `${ev.name} is behind schedule`;
      const body = ev.kind === "goal_milestone"
        ? `You're ${Math.round(ev.pct)}% of the way to this goal.`
        : `At the current pace you'll miss the target date. Consider a top-up.`;

      await db.from("notifications").insert({
        user_id: userId,
        kind: ev.kind,
        title,
        body,
        link: "/goals",
        ref_id: ev.goal_id,
      });
    } catch (e) {
      console.error("notification insert failed:", (e as Error).message);
    }
  }
}
