// Shared builder for the weekly summary email. Used by both the user-initiated
// `weekly-review` function and the cron `weekly-review-batch` function.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { formatKES } from "./kes.ts";
import { dateRange, weekBounds } from "./week.ts";
import { emailShell, EMAIL } from "./email.ts";
import { tipForWeek } from "./tips.ts";
import { highestMilestone } from "./goals.ts";

const BUCKETS = ["S", "I", "P", "E"] as const;
const BUCKET_NAMES: Record<string, string> = {
  S: "Savings",
  I: "Invest",
  P: "Pay yourself",
  E: "Expenses",
};

export interface GoalEvent {
  goal_id: string;
  name: string;
  kind: "goal_milestone" | "goal_behind";
  milestone: number | null;
  pct: number;
}

export interface WeeklyReview {
  subject: string;
  html: string;
  range: string;
  weekIncome: number;
  weekSpend: number;
  goalEvents: GoalEvent[];
}

interface BuildOpts {
  userId: string;
  email: string;
  now?: Date;
  unsubscribeToken?: string | null;
}

interface TxnRow {
  type: string;
  bucket: string | null;
  amount: number | string;
  category: string | null;
  parent_id: string | null;
  occurred_at: string;
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number | string;
  target_date: string | null;
  created_at: string;
  funding: string;
  bucket: string | null;
}

interface ProgressRow {
  goal_id: string;
  current_amount: number | string;
  last_contribution_at: string | null;
}

export async function buildWeeklyReview(
  db: SupabaseClient,
  { userId, email, now = new Date(), unsubscribeToken = null }: BuildOpts,
): Promise<WeeklyReview> {
  const { thisMonday, lastMonday, lastSunday } = weekBounds(now);

  const [txnRes, balRes, profRes, goalsRes, progressRes] = await Promise.all([
    db.from("transactions")
      .select("type,bucket,amount,category,description,occurred_at,parent_id")
      .eq("user_id", userId)
      .gte("occurred_at", lastMonday.toISOString())
      .lt("occurred_at", thisMonday.toISOString()),
    // SECURITY DEFINER RPC — `bucket_balances` filters on auth.uid() and returns
    // nothing under the service-role key used by weekly-review / -batch.
    db.rpc("user_bucket_balances", { p_user_id: userId }),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    db.from("goals").select("id,name,target_amount,target_date,created_at,funding,bucket")
      .eq("user_id", userId).eq("status", "active").order("sort_order"),
    db.from("goal_progress").select("goal_id,current_amount,last_contribution_at")
      .eq("user_id", userId),
  ]);

  const txns: TxnRow[] = txnRes.data ?? [];
  const balances: Record<string, number> = {};
  (balRes.data ?? []).forEach((r: { bucket: string; balance: number | string }) => {
    balances[r.bucket] = Number(r.balance);
  });
  const firstName = profRes.data?.full_name?.split(" ")[0] || email.split("@")[0];

  let weekIncome = 0;
  let weekSpend = 0;
  const byBucket: Record<string, { income: number; spend: number }> = {};
  BUCKETS.forEach((b) => { byBucket[b] = { income: 0, spend: 0 }; });

  for (const t of txns) {
    if (t.parent_id !== null) continue;
    if (t.type === "income" && t.bucket === null && t.category !== "Transfer") {
      weekIncome += Number(t.amount);
    }
    if (t.type === "expense" && t.category !== "Transfer") {
      weekSpend += Number(t.amount);
    }
  }
  for (const t of txns) {
    if (!t.bucket) continue;
    const b = t.bucket;
    if (!byBucket[b]) continue;
    if (t.type === "income" && t.category !== "Transfer") byBucket[b].income += Number(t.amount);
    if (t.type === "expense" && t.category !== "Transfer") byBucket[b].spend += Number(t.amount);
  }

  const net = weekIncome - weekSpend;
  const totalBalance = BUCKETS.reduce((s, b) => s + (balances[b] || 0), 0);
  const range = dateRange(lastMonday, lastSunday);

  const motiveLine = net >= 0
    ? `You came out <strong style="color:${EMAIL.good}">ahead by ${formatKES(net)}</strong> this week. Keep it up.`
    : `You spent <strong style="color:${EMAIL.bad}">${formatKES(Math.abs(net))} more than you earned</strong> this week. Next week is a fresh start.`;

  const bucketRows = BUCKETS.map((b) => {
    const name = BUCKET_NAMES[b];
    const bal = balances[b] ?? 0;
    const bIn = byBucket[b].income;
    const bOut = byBucket[b].spend;
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border}">${name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.good};text-align:right">${bIn > 0 ? `+${formatKES(bIn)}` : "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right">${bOut > 0 ? `-${formatKES(bOut)}` : "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;color:${bal < 0 ? EMAIL.bad : EMAIL.text}">${formatKES(bal)}</td>
      </tr>`;
  }).join("");

  // ---- Goals section + events -------------------------------------------------
  const goals: GoalRow[] = goalsRes.data ?? [];
  const progress: Record<string, ProgressRow> = {};
  (progressRes.data ?? []).forEach((p: ProgressRow) => { progress[p.goal_id] = p; });

  const goalEvents: GoalEvent[] = [];
  const goalRowsHtml = goals.map((g) => {
    // `goal_progress` resolves bucket-funded goals via `bucket_balances`, which
    // is empty under the service role — fall back to the RPC balance here.
    const cur = g.funding === "bucket" && g.bucket
      ? (balances[g.bucket] ?? Number(progress[g.id]?.current_amount ?? 0))
      : Number(progress[g.id]?.current_amount ?? 0);
    const target = Number(g.target_amount);
    const p = target > 0 ? Math.max(0, Math.min(100, (cur / target) * 100)) : 0;

    let statusHtml = "";
    if (g.target_date) {
      const start = new Date(g.created_at).getTime();
      const end = new Date(g.target_date).getTime();
      const elapsed = end > start ? (now.getTime() - start) / (end - start) : 1;
      const behind = p / 100 < elapsed - 0.05 && p < 100;
      statusHtml = behind
        ? `<span style="color:${EMAIL.bad}">Behind</span>`
        : `<span style="color:${EMAIL.good}">On track</span>`;
      if (behind) {
        goalEvents.push({ goal_id: g.id, name: g.name, kind: "goal_behind", milestone: null, pct: p });
      }
    }

    // Milestone: fresh contribution this week pushed it past a 25/50/75/100 mark.
    const lastContrib = progress[g.id]?.last_contribution_at;
    if (lastContrib && new Date(lastContrib) >= lastMonday && new Date(lastContrib) < thisMonday) {
      const hit = highestMilestone(p);
      if (hit) {
        goalEvents.push({ goal_id: g.id, name: g.name, kind: "goal_milestone", milestone: hit, pct: p });
      }
    }

    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border}">${g.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right">${formatKES(cur)} / ${formatKES(target)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600">${Math.round(p)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right">${statusHtml || "-"}</td>
      </tr>`;
  }).join("");

  const goalsSection = goals.length
    ? `
      <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;color:${EMAIL.textDim};text-transform:uppercase;letter-spacing:0.06em">Goals</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
        <thead>
          <tr style="color:${EMAIL.textFaint};font-size:11px;text-transform:uppercase;letter-spacing:0.06em">
            <th style="padding:6px 12px;text-align:left;font-weight:500">Goal</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">Saved</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">%</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">Status</th>
          </tr>
        </thead>
        <tbody>${goalRowsHtml}</tbody>
      </table>`
    : "";

  // ---- Tip ------------------------------------------------------------------
  const tip = tipForWeek(lastMonday);
  const tipSection = `
    <div style="background:${EMAIL.inset};border-radius:10px;padding:16px 18px;margin-bottom:28px">
      <p style="margin:0 0 4px;font-size:11px;color:${EMAIL.brand};text-transform:uppercase;letter-spacing:0.06em">Tip of the week</p>
      <p style="margin:0 0 4px;font-size:14px;font-weight:600">${tip.title}</p>
      <p style="margin:0;font-size:13px;color:${EMAIL.textDim}">${tip.body}</p>
    </div>`;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px">Hey ${firstName},</p>
    <p style="margin:0 0 28px;font-size:15px">${motiveLine}</p>

    <table style="width:100%;border-collapse:separate;border-spacing:12px 0;margin:0 -12px 28px">
      <tr>
        <td style="background:${EMAIL.inset};border-radius:10px;padding:16px;text-align:center;width:33%">
          <p style="margin:0;font-size:11px;color:${EMAIL.textDim};text-transform:uppercase;letter-spacing:0.06em">Income</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${EMAIL.good}">${formatKES(weekIncome)}</p>
        </td>
        <td style="background:${EMAIL.inset};border-radius:10px;padding:16px;text-align:center;width:33%">
          <p style="margin:0;font-size:11px;color:${EMAIL.textDim};text-transform:uppercase;letter-spacing:0.06em">Spent</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${weekSpend > weekIncome ? EMAIL.bad : EMAIL.text}">${formatKES(weekSpend)}</p>
        </td>
        <td style="background:${EMAIL.inset};border-radius:10px;padding:16px;text-align:center;width:33%">
          <p style="margin:0;font-size:11px;color:${EMAIL.textDim};text-transform:uppercase;letter-spacing:0.06em">Balance</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${totalBalance < 0 ? EMAIL.bad : EMAIL.text}">${formatKES(totalBalance)}</p>
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;color:${EMAIL.textDim};text-transform:uppercase;letter-spacing:0.06em">By bucket</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
      <thead>
        <tr style="color:${EMAIL.textFaint};font-size:11px;text-transform:uppercase;letter-spacing:0.06em">
          <th style="padding:6px 12px;text-align:left;font-weight:500">Bucket</th>
          <th style="padding:6px 12px;text-align:right;font-weight:500">In</th>
          <th style="padding:6px 12px;text-align:right;font-weight:500">Out</th>
          <th style="padding:6px 12px;text-align:right;font-weight:500">Balance</th>
        </tr>
      </thead>
      <tbody>${bucketRows}</tbody>
    </table>

    ${goalsSection}
    ${tipSection}`;

  const html = emailShell({
    heading: "Weekly Summary",
    subtitle: range,
    bodyHtml,
    unsubscribeToken,
  });

  return { subject: `Your SIPE week: ${range}`, html, range, weekIncome, weekSpend, goalEvents };
}
