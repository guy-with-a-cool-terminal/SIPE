import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
type AnalyticsPeriod = "week" | "lastweek" | "3m" | "6m" | "12m";

type ChartRow = {
  key: string;
  label: string;
  income: number;
  spend: number;
};

// Real income: parent row with bucket=null. Transfers always have a bucket set.
const isRealIncome  = (r: Transaction) => r.type === "income" && r.bucket === null;
const isRealExpense = (r: Transaction) => r.type === "expense" && r.category !== "Transfer";

function buildMonthlyRows(parents: Transaction[], cutoff: Date): ChartRow[] {
  const map = new Map<string, { label: string; income: number; spend: number }>();
  for (const r of parents) {
    const d = new Date(r.occurred_at);
    if (d < cutoff) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, {
        label: d.toLocaleDateString("en-KE", { month: "short", year: "numeric" }),
        income: 0, spend: 0,
      });
    }
    const g = map.get(key)!;
    if (isRealIncome(r))  g.income += Number(r.amount);
    if (isRealExpense(r)) g.spend  += Number(r.amount);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, ...g }));
}

function buildDailyRows(parents: Transaction[], start: Date, end: Date): ChartRow[] {
  const map = new Map<string, { label: string; income: number; spend: number }>();
  for (const r of parents) {
    const d = new Date(r.occurred_at);
    if (d < start || d >= end) continue;
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) {
      map.set(key, {
        label: d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric" }),
        income: 0, spend: 0,
      });
    }
    const g = map.get(key)!;
    if (isRealIncome(r))  g.income += Number(r.amount);
    if (isRealExpense(r)) g.spend  += Number(r.amount);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, ...g }));
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmtAxis(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

const barConfig: ChartConfig = {
  income: { label: "Income", color: "hsl(var(--primary))" },
  spend:  { label: "Spent",  color: "hsl(215 20% 45%)" },
};

const Analytics = () => {
  const { user } = useAuth();
  usePageTitle("Analytics");
  const [allParents, setAllParents] = useState<Transaction[]>([]);
  const [allBucketRows, setAllBucketRows] = useState<Transaction[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<AnalyticsPeriod>("6m");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      cutoff.setDate(1);
      cutoff.setHours(0, 0, 0, 0);

      const [txnRes, balRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, type, bucket, amount, parent_id, occurred_at, source, description, category")
          .gte("occurred_at", cutoff.toISOString())
          .order("occurred_at", { ascending: true })
          .limit(1000),
        supabase
          .from("bucket_balances")
          .select("balance")
          .eq("user_id", user.id),
      ]);

      const rows = (txnRes.data || []) as Transaction[];
      setAllParents(rows.filter(r => r.parent_id === null));
      setAllBucketRows(rows.filter(r => r.bucket !== null));
      const bal = (balRes.data || []).reduce((s, r) => s + Number(r.balance), 0);
      setTotalBalance(bal);
      setLoading(false);
    })();
  }, [user]);

  const weekBounds = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    thisMonday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
    return { thisMonday, nextMonday, lastMonday };
  }, []);

  const isWeekView = period === "week" || period === "lastweek";

  const periodCutoff = useMemo(() => {
    if (isWeekView) return period === "week" ? weekBounds.thisMonday : weekBounds.lastMonday;
    const d = new Date();
    d.setDate(1); d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (period === "3m" ? 3 : period === "6m" ? 6 : 12));
    return d;
  }, [period, isWeekView, weekBounds]);

  const periodEnd = useMemo(() => {
    if (period === "week") return weekBounds.nextMonday;
    if (period === "lastweek") return weekBounds.thisMonday;
    return null;
  }, [period, weekBounds]);

  const chartRows = useMemo(() => {
    if (isWeekView) return buildDailyRows(allParents, periodCutoff, periodEnd!);
    return buildMonthlyRows(allParents, periodCutoff);
  }, [allParents, periodCutoff, periodEnd, isWeekView]);

  // Keep monthlyRows for the monthly history table (always monthly)
  const monthlyRows = useMemo(
    () => buildMonthlyRows(allParents, (() => {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); d.setMonth(d.getMonth() - 6); return d;
    })()),
    [allParents]
  );

  const filteredBucketRows = useMemo(() => {
    const end = periodEnd;
    return allBucketRows.filter(r => {
      const d = new Date(r.occurred_at);
      return d >= periodCutoff && (end === null || d < end);
    });
  }, [allBucketRows, periodCutoff, periodEnd]);

  // ── Carry-over aware monthly table ───────────────────────────────────────
  const tableRows = useMemo(() => {
    const rows = monthlyRows.slice().reverse().slice(0, 6);
    let running = totalBalance;
    return rows.map(row => {
      const closing = running;
      const opening = closing - row.income + row.spend;
      running = opening;
      const monthlyDelta = row.income - row.spend;
      return { ...row, opening, closing, monthlyDelta };
    });
  }, [monthlyRows, totalBalance]);

  // ── KPI cards ────────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

  const lastFullMonthRow = [...tableRows].find(r => r.key !== currentMonthKey);
  const currentMonthRow  = tableRows.find(r => r.key === currentMonthKey);

  const periodIncome = chartRows.reduce((s, r) => s + r.income, 0);
  const periodSpend  = chartRows.reduce((s, r) => s + r.spend, 0);

  // Trend: last full month delta vs the one before it
  const prevMonthRow = tableRows.filter(r => r.month !== currentMonthKey)[1];
  const lastFullDelta   = lastFullMonthRow?.closing ?? 0;
  const prevDelta       = prevMonthRow?.closing ?? 0;
  const balanceTrend    = lastFullDelta - prevDelta;

  // ── Bucket spend (period) ─────────────────────────────────────────────────
  const bucketSpend: Partial<Record<Bucket, number>> = {};
  for (const r of filteredBucketRows) {
    if (r.type !== "expense" || r.category === "Transfer") continue;
    const b = r.bucket as Bucket;
    bucketSpend[b] = (bucketSpend[b] || 0) + Number(r.amount);
  }
  const totalBucketSpend = ALL_BUCKETS.reduce((s, b) => s + (bucketSpend[b] || 0), 0);

  const pieData = ALL_BUCKETS
    .filter(b => (bucketSpend[b] || 0) > 0)
    .map(b => ({
      bucket: b, name: BUCKET_META[b].name,
      value: bucketSpend[b]!,
      fill: `hsl(${BUCKET_META[b].color})`,
    }));

  // ── Income sources ─────────────────────────────────────────────────────────
  const sourceMap = new Map<string, number>();
  for (const r of allParents) {
    const d = new Date(r.occurred_at);
    if (d < periodCutoff || !isRealIncome(r)) continue;
    if (periodEnd && d >= periodEnd) continue;
    const key = r.source || r.description || "Other";
    sourceMap.set(key, (sourceMap.get(key) || 0) + Number(r.amount));
  }
  const sortedSources = [...sourceMap.entries()].sort(([, a], [, b]) => b - a);
  const top5 = sortedSources.slice(0, 5);
  const otherAmt = sortedSources.slice(5).reduce((s, [, v]) => s + v, 0);
  if (otherAmt > 0) top5.push(["Other", otherAmt]);
  const totalSourceIncome = top5.reduce((s, [, v]) => s + v, 0);

  // ── Weekly habits ────────────────────────────────────────────────────────────
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const thisWeekStart = getWeekStart(now);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd   = thisWeekStart;

    const filterParents = (from: Date, to: Date) =>
      allParents.filter(r => { const d = new Date(r.occurred_at); return d >= from && d < to; });

    const filterBucket = (from: Date, to: Date) =>
      allBucketRows.filter(r => {
        const d = new Date(r.occurred_at);
        return d >= from && d < to && r.type === "expense" && r.category !== "Transfer";
      });

    const sumIncome = (rows: Transaction[]) => rows.filter(isRealIncome).reduce((s, r) => s + Number(r.amount), 0);
    const sumSpend  = (rows: Transaction[]) => rows.filter(isRealExpense).reduce((s, r) => s + Number(r.amount), 0);
    const byBucket  = (rows: Transaction[]) => {
      const m: Partial<Record<Bucket, number>> = {};
      for (const r of rows) { const b = r.bucket as Bucket; m[b] = (m[b] || 0) + Number(r.amount); }
      return m;
    };

    const thisRows = filterParents(thisWeekStart, new Date(9999, 0, 1));
    const lastRows = filterParents(lastWeekStart, lastWeekEnd);

    const twIncome = sumIncome(thisRows);
    const twSpend  = sumSpend(thisRows);
    const lwIncome = sumIncome(lastRows);
    const lwSpend  = sumSpend(lastRows);

    const thisBktSpend = byBucket(filterBucket(thisWeekStart, new Date(9999, 0, 1)));
    const lastBktSpend = byBucket(filterBucket(lastWeekStart, lastWeekEnd));

    // Top categories this week
    const catMap = new Map<string, number>();
    for (const r of allBucketRows) {
      if (new Date(r.occurred_at) < thisWeekStart || r.type !== "expense" || r.category === "Transfer") continue;
      const cat = r.category || r.description || "Other";
      catMap.set(cat, (catMap.get(cat) || 0) + Number(r.amount));
    }
    const topCategories = [...catMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 4);

    // Streak: look back week by week from last week (current week is still in progress)
    let streak = 0;
    let streakType: "green" | "red" = "green";
    for (let i = 1; i <= 12; i++) {
      const wStart = new Date(thisWeekStart); wStart.setDate(wStart.getDate() - i * 7);
      const wEnd   = new Date(wStart);        wEnd.setDate(wEnd.getDate() + 7);
      const wRows  = filterParents(wStart, wEnd);
      if (wRows.length === 0) break;
      const wSpend  = sumSpend(wRows);
      const wIncome = sumIncome(wRows);
      const green   = wSpend <= wIncome;
      if (i === 1) { streakType = green ? "green" : "red"; streak = 1; }
      else if ((green && streakType === "green") || (!green && streakType === "red")) streak++;
      else break;
    }

    // Projected monthly spend at current week's daily rate
    const daysIntoWeek = Math.max(1, (now.getTime() - thisWeekStart.getTime()) / 86400000);
    const projectedMonthly = (twSpend / daysIntoWeek) * 7 * 4.33;

    const thisWeekLabel = (() => {
      const end = new Date(thisWeekStart); end.setDate(end.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
      return `${fmt(thisWeekStart)} – ${fmt(end)}`;
    })();

    return { twIncome, twSpend, lwIncome, lwSpend, thisBktSpend, lastBktSpend, topCategories, streak, streakType, projectedMonthly, thisWeekLabel };
  }, [allParents, allBucketRows]);

  const weekLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    if (period === "week") {
      const end = new Date(weekBounds.thisMonday); end.setDate(end.getDate() + 6);
      return `${fmt(weekBounds.thisMonday)} – ${fmt(end)}`;
    }
    const end = new Date(weekBounds.lastMonday); end.setDate(end.getDate() + 6);
    return `${fmt(weekBounds.lastMonday)} – ${fmt(end)}`;
  })();

  const periodBtnClass = (p: AnalyticsPeriod) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${
      period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  if (loading) return <div className="p-10 text-muted-foreground">Loading analytics…</div>;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">

      <PageHeader
        title="Analytics"
        subtitle="Build the habit. Track the proof."
        actions={
          <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl max-w-full overflow-x-auto">
            <button className={periodBtnClass("week")}     onClick={() => setPeriod("week")}>This week</button>
            <button className={periodBtnClass("lastweek")} onClick={() => setPeriod("lastweek")}>Last week</button>
            <button className={periodBtnClass("3m")}       onClick={() => setPeriod("3m")}>3 months</button>
            <button className={periodBtnClass("6m")}       onClick={() => setPeriod("6m")}>6 months</button>
            <button className={periodBtnClass("12m")}      onClick={() => setPeriod("12m")}>12 months</button>
          </div>
        }
      />

      {chartRows.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">
          No transactions in this period yet.
        </div>
      ) : (
        <div className="space-y-5">

          {/* KPI cards — 3 across */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Summary card — week label or last full month */}
            <div className="glass rounded-xl p-5">
              {isWeekView ? (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{weekLabel}</p>
                  <p className={`text-2xl font-bold ${periodIncome - periodSpend >= 0 ? "text-primary" : "text-destructive"}`}>
                    {periodIncome - periodSpend >= 0 ? "+" : ""}{formatKES(periodIncome - periodSpend)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Net for the week</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                    {lastFullMonthRow ? lastFullMonthRow.label : "Last month"}
                  </p>
                  {lastFullMonthRow ? (
                    <>
                      <div className="flex items-end gap-2 mb-2">
                        <p className={`text-2xl font-bold ${lastFullMonthRow.closing >= 0 ? "" : "text-destructive"}`}>
                          {formatKES(lastFullMonthRow.closing)}
                        </p>
                        <div className={`flex items-center gap-0.5 text-xs mb-0.5 ${balanceTrend >= 0 ? "text-primary" : "text-destructive"}`}>
                          {balanceTrend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                          {formatKES(Math.abs(balanceTrend))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Opened {formatKES(lastFullMonthRow.opening)} · Earned {formatKES(lastFullMonthRow.income)} · Spent {formatKES(lastFullMonthRow.spend)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data yet.</p>
                  )}
                </>
              )}
            </div>

            {/* Period income */}
            <div className="glass rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                {isWeekView ? "Income this week" : "Earned this period"}
              </p>
              <p className="text-2xl font-bold text-primary">{formatKES(periodIncome)}</p>
              {!isWeekView && (
                <p className="text-xs text-muted-foreground mt-2">
                  {chartRows.length} month{chartRows.length !== 1 ? "s" : ""} · avg {formatKES(chartRows.length ? periodIncome / chartRows.length : 0)}/mo
                </p>
              )}
            </div>

            {/* Period spend */}
            <div className="glass rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                {isWeekView ? "Spent this week" : "Spent this period"}
              </p>
              <p className="text-2xl font-bold">{formatKES(periodSpend)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {periodIncome > 0
                  ? `${((periodSpend / periodIncome) * 100).toFixed(0)}% of income${!isWeekView ? ` · avg ${formatKES(chartRows.length ? periodSpend / chartRows.length : 0)}/mo` : ""}`
                  : "No income in period"}
              </p>
            </div>
          </div>

          {/* Income vs. Spend bar chart */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold">Income vs. spend</h2>
              <span className="text-xs text-muted-foreground">Transfers excluded</span>
            </div>
            <ChartContainer config={barConfig} className="h-64 w-full mt-3">
              <BarChart data={chartRows} barGap={3} barCategoryGap="20%" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--secondary))", opacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      formatter={(value) => <span className="font-semibold">{formatKES(Number(value))}</span>}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="spend"  fill="var(--color-spend)"  radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Bucket breakdown + Monthly history — side by side on large screens */}
          <div className="grid lg:grid-cols-2 gap-5">

            {/* Spending by bucket */}
            {totalBucketSpend > 0 ? (
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Spending by bucket</h2>
                <div className="flex flex-col items-center gap-5 sm:flex-row">
                  {/* Donut */}
                  <div className="flex-shrink-0 w-36">
                    <ChartContainer config={{}} className="h-36 w-full">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={42} outerRadius={64}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} opacity={0.9} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => <span className="font-semibold">{formatKES(Number(value))}</span>}
                              nameKey="name"
                            />
                          }
                        />
                      </PieChart>
                    </ChartContainer>
                  </div>
                  {/* Bars */}
                  <div className="flex-1 space-y-2.5 min-w-0">
                    {ALL_BUCKETS.filter(b => (bucketSpend[b] || 0) > 0).map(b => {
                      const amount = bucketSpend[b]!;
                      const pct = (amount / totalBucketSpend) * 100;
                      const meta = BUCKET_META[b];
                      return (
                        <div key={b}>
                          <div className="flex justify-between text-xs mb-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="size-4 rounded text-xs font-bold grid place-items-center flex-shrink-0"
                                style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}
                              >
                                {b}
                              </span>
                              <span className="font-medium truncate">{meta.name}</span>
                            </div>
                            <span className="text-muted-foreground tabular-nums ml-2 flex-shrink-0">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: `hsl(${meta.color})` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground pt-1">
                      Total {formatKES(totalBucketSpend)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass rounded-xl p-5 flex items-center justify-center text-sm text-muted-foreground">
                No spending data in this period.
              </div>
            )}

            {/* Monthly history with carry-over context */}
            {!isWeekView && tableRows.length > 0 && (
              <div className="glass rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Monthly balance</h2>
                  <span className="text-xs text-muted-foreground">Carry-over included</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/30 text-muted-foreground uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-2.5">Month</th>
                        <th className="text-right px-3 py-2.5">Opening</th>
                        <th className="text-right px-3 py-2.5">In</th>
                        <th className="text-right px-3 py-2.5">Out</th>
                        <th className="text-right px-4 py-2.5">Closing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tableRows.map(row => (
                        <tr key={row.month} className="hover:bg-secondary/10 transition">
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">{row.label}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                            {formatKES(row.opening)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-primary tabular-nums">
                            {row.income > 0 ? `+${formatKES(row.income)}` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                            {row.spend > 0 ? `−${formatKES(row.spend)}` : "—"}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                            row.closing >= 0 ? "text-primary" : "text-destructive"
                          }`}>
                            {formatKES(row.closing)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border">
                  Closing = opening + income − spend. Transfers between buckets cancel out.
                </p>
              </div>
            )}
          </div>

          {/* Income sources — full width */}
          {top5.length > 0 && (
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Where your income comes from</h2>
                <span className="text-xs text-muted-foreground">Real deposits only</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
                {top5.map(([source, amount]) => {
                  const pct = totalSourceIncome > 0 ? (amount / totalSourceIncome) * 100 : 0;
                  return (
                    <div key={source}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium truncate max-w-[55%]">{source}</span>
                        <span className="text-muted-foreground tabular-nums ml-3 flex-shrink-0">
                          {formatKES(amount)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: "hsl(var(--primary))" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly habits */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Weekly habits</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{weeklyStats.thisWeekLabel} · vs last week</p>
              </div>
              {weeklyStats.streak >= 2 && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  weeklyStats.streakType === "green"
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {weeklyStats.streak}w {weeklyStats.streakType === "green" ? "under budget" : "overspent"}
                </span>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">

              {/* This week vs last week */}
              <div>
                <div className="grid grid-cols-4 text-xs text-muted-foreground mb-2 px-0.5">
                  <span></span>
                  <span className="text-right">This week</span>
                  <span className="text-right">Last week</span>
                  <span className="text-right">Change</span>
                </div>
                {[
                  { label: "Income",  thisVal: weeklyStats.twIncome, lastVal: weeklyStats.lwIncome, goodIfUp: true  },
                  { label: "Spend",   thisVal: weeklyStats.twSpend,  lastVal: weeklyStats.lwSpend,  goodIfUp: false },
                  { label: "Net",     thisVal: weeklyStats.twIncome - weeklyStats.twSpend, lastVal: weeklyStats.lwIncome - weeklyStats.lwSpend, goodIfUp: true },
                ].map(({ label, thisVal, lastVal, goodIfUp }) => {
                  const delta = thisVal - lastVal;
                  const pct   = lastVal !== 0 ? (delta / Math.abs(lastVal)) * 100 : null;
                  const good  = goodIfUp ? delta >= 0 : delta <= 0;
                  return (
                    <div key={label} className="grid grid-cols-4 items-center py-2 border-b border-border/40 last:border-0 text-sm">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="text-right tabular-nums font-medium">{formatKES(thisVal)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{formatKES(lastVal)}</span>
                      <span className={`text-right text-xs flex items-center justify-end gap-0.5 ${
                        pct === null ? "text-muted-foreground" : good ? "text-primary" : "text-destructive"
                      }`}>
                        {pct !== null && (delta > 0 ? <TrendingUp className="size-3" /> : delta < 0 ? <TrendingDown className="size-3" /> : null)}
                        {pct !== null ? `${Math.abs(pct).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  );
                })}

                <div className="mt-4 p-3 rounded-xl bg-secondary/30">
                  <p className="text-xs text-muted-foreground">At this week's pace</p>
                  <p className="text-base font-bold mt-0.5">
                    {formatKES(weeklyStats.projectedMonthly)}
                    <span className="text-xs font-normal text-muted-foreground"> / month</span>
                  </p>
                  {weeklyStats.lwSpend > 0 && (
                    <p className={`text-xs mt-1 ${weeklyStats.twSpend <= weeklyStats.lwSpend ? "text-primary" : "text-destructive"}`}>
                      {weeklyStats.twSpend <= weeklyStats.lwSpend
                        ? `↓ ${formatKES(weeklyStats.lwSpend - weeklyStats.twSpend)} less than last week`
                        : `↑ ${formatKES(weeklyStats.twSpend - weeklyStats.lwSpend)} more than last week`}
                    </p>
                  )}
                </div>
              </div>

              {/* Bucket deltas + top categories */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Spend by bucket this week</p>
                  <div className="space-y-2">
                    {ALL_BUCKETS.map(b => {
                      const meta = BUCKET_META[b];
                      const thisAmt = weeklyStats.thisBktSpend[b] || 0;
                      const lastAmt = weeklyStats.lastBktSpend[b] || 0;
                      if (thisAmt === 0 && lastAmt === 0) return null;
                      const delta   = thisAmt - lastAmt;
                      const pct     = lastAmt > 0 ? (delta / lastAmt) * 100 : null;
                      const maxAmt  = Math.max(thisAmt, lastAmt, 1);
                      return (
                        <div key={b}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="size-4 rounded text-xs font-bold grid place-items-center flex-shrink-0"
                                style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}>
                                {b}
                              </span>
                              <span className="text-muted-foreground">{meta.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums font-medium">{formatKES(thisAmt)}</span>
                              {pct !== null && (
                                <span className={`flex items-center gap-0.5 ${delta <= 0 ? "text-primary" : "text-destructive"}`}>
                                  {delta <= 0 ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                                  {Math.abs(pct).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-1 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${(thisAmt / maxAmt) * 100}%`, backgroundColor: `hsl(${meta.color})` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {weeklyStats.topCategories.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Top categories this week</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklyStats.topCategories.map(([cat, amt]) => (
                        <span key={cat} className="text-xs px-2 py-1 rounded-full bg-secondary/50">
                          {cat} <span className="text-muted-foreground">{formatKES(amt)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default Analytics;
