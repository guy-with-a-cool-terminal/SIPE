// Send a weekly financial summary email via Resend.
// Auth required (JWT). Deploy: supabase functions deploy weekly-review

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BUCKETS = ["S", "I", "P", "E"] as const;
const BUCKET_NAMES: Record<string, string> = { S: "Savings", I: "Invest", P: "Pay yourself", E: "Expenses" };

function formatKES(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
}

function dateRange(start: Date, end: Date) {
  const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
  return `${fmt(start)} - ${fmt(end)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;
    const userId = user.id;
    const userEmail = user.email!;

    const serviceClient = createClient(SUPABASE_URL, SERVICE);

    // Week boundaries: Mon-Sun of the most recently completed week
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysToLastMon);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setMilliseconds(-1);

    const [txnRes, balRes, profRes] = await Promise.all([
      serviceClient
        .from("transactions")
        .select("type,bucket,amount,category,description,occurred_at,parent_id")
        .eq("user_id", userId)
        .gte("occurred_at", lastMonday.toISOString())
        .lt("occurred_at", thisMonday.toISOString()),
      serviceClient
        .from("bucket_balances")
        .select("bucket,balance")
        .eq("user_id", userId),
      serviceClient
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const txns = txnRes.data || [];
    const balances: Record<string, number> = {};
    (balRes.data || []).forEach((r: { bucket: string; balance: number }) => {
      balances[r.bucket] = Number(r.balance);
    });
    const firstName = profRes.data?.full_name?.split(" ")[0] || userEmail.split("@")[0];

    // Compute weekly totals
    let weekIncome = 0, weekSpend = 0;
    const byBucket: Record<string, { income: number; spend: number }> = {};
    BUCKETS.forEach(b => { byBucket[b] = { income: 0, spend: 0 }; });

    for (const t of txns) {
      if (t.parent_id !== null) continue; // only parent rows for income
      if (t.type === "income" && t.bucket === null && t.category !== "Transfer") {
        weekIncome += Number(t.amount);
      }
      if (t.type === "expense" && t.category !== "Transfer") {
        weekSpend += Number(t.amount);
      }
    }
    for (const t of txns) {
      if (!t.bucket) continue;
      const b = t.bucket as string;
      if (!byBucket[b]) continue;
      if (t.type === "income" && t.category !== "Transfer") byBucket[b].income += Number(t.amount);
      if (t.type === "expense" && t.category !== "Transfer") byBucket[b].spend += Number(t.amount);
    }

    const net = weekIncome - weekSpend;
    const totalBalance = BUCKETS.reduce((s, b) => s + (balances[b] || 0), 0);
    const range = dateRange(lastMonday, lastSunday);

    const motiveLine = net >= 0
      ? `You came out <strong style="color:#22c55e">ahead by ${formatKES(net)}</strong> this week. Keep it up.`
      : `You spent <strong style="color:#ef4444">${formatKES(Math.abs(net))} more than you earned</strong> this week. Next week is a fresh start.`;

    const bucketRows = BUCKETS.map(b => {
      const name = BUCKET_NAMES[b];
      const bal = balances[b] ?? 0;
      const bIn = byBucket[b].income;
      const bOut = byBucket[b].spend;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a">${name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#22c55e;text-align:right">${bIn > 0 ? `+${formatKES(bIn)}` : "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;text-align:right">${bOut > 0 ? `-${formatKES(bOut)}` : "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;text-align:right;font-weight:600;color:${bal < 0 ? "#ef4444" : "#e2e8f0"}">${formatKES(bal)}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0">
  <div style="max-width:560px;margin:32px auto;background:#1a1a2e;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6d28d9,#4f46e5);padding:32px;text-align:center">
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:0.08em;text-transform:uppercase">SIPE</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:700">Weekly Summary</h1>
      <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.75)">${range}</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px">Hey ${firstName},</p>
      <p style="margin:0 0 28px;font-size:15px">${motiveLine}</p>

      <div style="display:flex;gap:12px;margin-bottom:28px">
        <div style="flex:1;background:#0f0f1a;border-radius:10px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Income</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#22c55e">${formatKES(weekIncome)}</p>
        </div>
        <div style="flex:1;background:#0f0f1a;border-radius:10px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Spent</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${weekSpend > weekIncome ? "#ef4444" : "#e2e8f0"}">${formatKES(weekSpend)}</p>
        </div>
        <div style="flex:1;background:#0f0f1a;border-radius:10px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">Balance</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${totalBalance < 0 ? "#ef4444" : "#e2e8f0"}">${formatKES(totalBalance)}</p>
        </div>
      </div>

      <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">By bucket</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
        <thead>
          <tr style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">
            <th style="padding:6px 12px;text-align:left;font-weight:500">Bucket</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">In</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">Out</th>
            <th style="padding:6px 12px;text-align:right;font-weight:500">Balance</th>
          </tr>
        </thead>
        <tbody>${bucketRows}</tbody>
      </table>

      <p style="margin:0;font-size:12px;color:#475569;text-align:center">
        View full details in your <a href="https://app.sipe.money" style="color:#818cf8;text-decoration:none">SIPE dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SIPE <noreply@cnbcode.dev>",
        to: [userEmail],
        subject: `Your SIPE week: ${range}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.json().catch(() => ({}));
      console.error("Resend error:", JSON.stringify(err));
      return json({ error: "Resend rejected the request", detail: err }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("weekly-review error:", msg);
    return json({ error: msg }, 500);
  }
});
