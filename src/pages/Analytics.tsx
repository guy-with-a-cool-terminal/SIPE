import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingDown, TrendingUp } from "lucide-react";
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
type AnalyticsPeriod = "3m" | "6m" | "12m";

type MonthlyRow = {
  month: string;
  label: string;
  income: number;
  spend: number;
};

// Real income: parent row with bucket=null. Transfers always have a bucket set.
const isRealIncome  = (r: Transaction) => r.type === "income" && r.bucket === null;
const isRealExpense = (r: Transaction) => r.type === "expense" && r.category !== "Transfer";

function buildMonthlyRows(parents: Transaction[], cutoff: Date): MonthlyRow[] {
  const map = new Map<string, { label: string; income: number; spend: number }>();
  for (const r of parents) {
    const d = new Date(r.occurred_at);
    if (d < cutoff) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!map.has(month)) {
      map.set(month, {
        label: d.toLocaleDateString("en-KE", { month: "short", year: "numeric" }),
        income: 0, spend: 0,
      });
    }
    const g = map.get(month)!;
    if (isRealIncome(r))  g.income += Number(r.amount);
    if (isRealExpense(r)) g.spend  += Number(r.amount);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, g]) => ({ month, ...g }));
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

  const periodCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(1); d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (period === "3m" ? 3 : period === "6m" ? 6 : 12));
    return d;
  }, [period]);

  const monthlyRows = useMemo(
    () => buildMonthlyRows(allParents, periodCutoff),
    [allParents, periodCutoff]
  );

  const filteredBucketRows = useMemo(
    () => allBucketRows.filter(r => new Date(r.occurred_at) >= periodCutoff),
    [allBucketRows, periodCutoff]
  );

  // ── Carry-over aware monthly table ───────────────────────────────────────
  // Work backwards from the current real balance to compute opening/closing per month.
  // This means "net -4,590 in May" shows correctly as "opened +10,200, closed +5,610".
  const tableRows = useMemo(() => {
    const rows = monthlyRows.slice().reverse().slice(0, 6);
    let running = totalBalance;
    return rows.map(row => {
      const closing = running;
      const opening = closing - row.income + row.spend;
      running = opening;
      const monthlyDelta = row.income - row.spend; // from this month's transactions only
      return { ...row, opening, closing, monthlyDelta };
    });
  }, [monthlyRows, totalBalance]);

  // ── KPI cards ────────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

  // Last full month (skip the current partial month for rate display)
  const lastFullMonthRow = [...tableRows].find(r => r.month !== currentMonthKey);
  const currentMonthRow  = tableRows.find(r => r.month === currentMonthKey);

  const periodIncome = monthlyRows.reduce((s, r) => s + r.income, 0);
  const periodSpend  = monthlyRows.reduce((s, r) => s + r.spend, 0);

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
    if (new Date(r.occurred_at) < periodCutoff || !isRealIncome(r)) continue;
    const key = r.source || r.description || "Other";
    sourceMap.set(key, (sourceMap.get(key) || 0) + Number(r.amount));
  }
  const sortedSources = [...sourceMap.entries()].sort(([, a], [, b]) => b - a);
  const top5 = sortedSources.slice(0, 5);
  const otherAmt = sortedSources.slice(5).reduce((s, [, v]) => s + v, 0);
  if (otherAmt > 0) top5.push(["Other", otherAmt]);
  const totalSourceIncome = top5.reduce((s, [, v]) => s + v, 0);

  const periodBtnClass = (p: AnalyticsPeriod) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  if (loading) return <div className="p-10 text-muted-foreground">Loading analytics…</div>;

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full">

      {/* Header + period picker inline */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build the habit. Track the proof.</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl">
          <button className={periodBtnClass("3m")}  onClick={() => setPeriod("3m")}>3 months</button>
          <button className={periodBtnClass("6m")}  onClick={() => setPeriod("6m")}>6 months</button>
          <button className={periodBtnClass("12m")} onClick={() => setPeriod("12m")}>12 months</button>
        </div>
      </div>

      {monthlyRows.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">
          No transactions in this period yet.
        </div>
      ) : (
        <div className="space-y-5">

          {/* KPI cards — 3 across */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Last full month summary */}
            <div className="glass rounded-xl p-5">
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
            </div>

            {/* Period income */}
            <div className="glass rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Earned this period</p>
              <p className="text-2xl font-bold text-primary">{formatKES(periodIncome)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {monthlyRows.length} month{monthlyRows.length !== 1 ? "s" : ""} · avg {formatKES(monthlyRows.length ? periodIncome / monthlyRows.length : 0)}/mo
              </p>
            </div>

            {/* Period spend */}
            <div className="glass rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Spent this period</p>
              <p className="text-2xl font-bold">{formatKES(periodSpend)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {periodIncome > 0
                  ? `${((periodSpend / periodIncome) * 100).toFixed(0)}% of income · avg ${formatKES(monthlyRows.length ? periodSpend / monthlyRows.length : 0)}/mo`
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
              <BarChart data={monthlyRows} barGap={3} barCategoryGap="20%" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
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
                <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="spend"  fill="var(--color-spend)"  radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Bucket breakdown + Monthly history — side by side on large screens */}
          <div className="grid lg:grid-cols-2 gap-5">

            {/* Spending by bucket */}
            {totalBucketSpend > 0 ? (
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Spending by bucket</h2>
                <div className="flex items-center gap-5">
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
            {tableRows.length > 0 && (
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

        </div>
      )}
    </div>
  );
};

export default Analytics;
