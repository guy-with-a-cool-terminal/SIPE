import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type BucketBalance, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { DepositModal } from "@/components/app/DepositModal";
import { TransactionDetailSheet } from "@/components/app/TransactionDetailSheet";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
type Period = "all" | "week" | "month";

function monthKey(date: string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
}

function monthLabel(date: string) {
  return new Date(date).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

const Dashboard = () => {
  const { user } = useAuth();
  const [balances, setBalances] = useState<Record<Bucket, BucketBalance>>({} as Record<Bucket, BucketBalance>);
  const [allRows, setAllRows] = useState<Transaction[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>("all");
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [balRes, recentRes, monthRes] = await Promise.all([
        supabase.from("bucket_balances").select("*").eq("user_id", user.id),
        // Fetch all rows including split children (needed for the detail sheet)
        supabase.from("transactions")
          .select("*")
          .order("occurred_at", { ascending: false })
          .limit(300),
        supabase.from("transactions")
          .select("type,amount,parent_id")
          .is("parent_id", null)
          .gte("occurred_at", monthStart.toISOString()),
      ]);

      const map = {} as Record<Bucket, BucketBalance>;
      ALL_BUCKETS.forEach(b => { map[b] = { user_id: user.id, bucket: b, allocated: 0, spent: 0, balance: 0 }; });
      (balRes.data || []).forEach((r: BucketBalance) => { map[r.bucket] = r; });
      setBalances(map);

      const fetched: Transaction[] = recentRes.data || [];
      setAllRows(fetched);
      const parentRows = fetched.filter(r => r.parent_id === null);
      setRecent(parentRows);

      if (parentRows.length > 0) {
        setExpanded(new Set([monthKey(parentRows[0].occurred_at)]));
      }

      let inc = 0, sp = 0;
      (monthRes.data || []).forEach(r => {
        if (r.type === "income") inc += Number(r.amount);
        if (r.type === "expense") sp += Number(r.amount);
      });
      setMonthIncome(inc);
      setMonthSpend(sp);
      setLoading(false);
    })();
  }, [user, reloadKey]);

  const totalBalance = ALL_BUCKETS.reduce((s, b) => s + Number(balances[b]?.balance || 0), 0);

  // Period start date
  const periodStart = useMemo((): Date | null => {
    if (period === "all") return null;
    const now = new Date();
    if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
  }, [period]);

  // Period-specific stats computed from the fetched rows (avoids extra DB call)
  const periodStats = useMemo(() => {
    const start = periodStart;
    const rows = start ? allRows.filter(r => new Date(r.occurred_at) >= start) : allRows;

    let income = 0, spend = 0;
    const byBucket = Object.fromEntries(
      ALL_BUCKETS.map(b => [b, { allocated: 0, spent: 0 }])
    ) as Record<Bucket, { allocated: number; spent: number }>;

    for (const r of rows) {
      if (r.parent_id === null && r.type === "income") income += Number(r.amount);
      if (r.parent_id === null && r.type === "expense") spend += Number(r.amount);
      if (r.bucket) {
        if (r.type === "income") byBucket[r.bucket].allocated += Number(r.amount);
        if (r.type === "expense") byBucket[r.bucket].spent += Number(r.amount);
      }
    }
    return { income, spend, byBucket };
  }, [allRows, periodStart]);

  // Summary card values: use period stats when filtered, DB month values for "all"
  const displayIncome = period === "all" ? monthIncome : periodStats.income;
  const displaySpend = period === "all" ? monthSpend : periodStats.spend;
  const incomeLabel = period === "week" ? "this week" : "this month";
  const spendLabel = period === "week" ? "this week" : "this month";

  // Recent transactions filtered to the selected period
  const filteredRecent = useMemo(() => {
    if (!periodStart) return recent;
    return recent.filter(r => new Date(r.occurred_at) >= periodStart);
  }, [recent, periodStart]);

  // Group transactions by month
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Transaction[]; income: number; spend: number }>();
    for (const t of filteredRecent) {
      const key = monthKey(t.occurred_at);
      if (!map.has(key)) {
        map.set(key, { label: monthLabel(t.occurred_at), items: [], income: 0, spend: 0 });
      }
      const g = map.get(key)!;
      g.items.push(t);
      if (t.type === "income") g.income += Number(t.amount);
      else g.spend += Number(t.amount);
    }
    return Array.from(map.entries()).map(([key, g]) => ({ key, ...g }));
  }, [filteredRecent]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const periodBtnClass = (p: Period) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Hi {user?.user_metadata?.full_name || user?.email?.split("@")[0]} 👋</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">Your money, on purpose.</h1>
        </div>
        <button
          onClick={() => setShowDeposit(true)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-semibold hover:bg-primary-glow transition flex items-center gap-2"
        >
          <Plus className="size-4" /> Deposit earnings
        </button>
      </div>

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} onSaved={() => setReloadKey(k => k + 1)} />

      {/* Period picker */}
      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6">
        <button className={periodBtnClass("all")} onClick={() => setPeriod("all")}>All time</button>
        <button className={periodBtnClass("week")} onClick={() => setPeriod("week")}>This week</button>
        <button className={periodBtnClass("month")} onClick={() => setPeriod("month")}>This month</button>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="glass rounded-2xl p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total balance</p>
          <p className={`text-3xl font-bold mt-2 ${totalBalance < 0 ? "text-destructive" : ""}`}>
            {formatKES(totalBalance)}
          </p>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ArrowDownRight className="size-3.5 text-primary" /> Income {incomeLabel}
          </div>
          <p className="text-3xl font-bold mt-2">{formatKES(displayIncome)}</p>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ArrowUpRight className="size-3.5" /> Spent {spendLabel}
          </div>
          <p className="text-3xl font-bold mt-2">{formatKES(displaySpend)}</p>
        </div>
      </div>

      {/* Buckets */}
      <h2 className="text-lg font-semibold mb-4">Buckets</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {ALL_BUCKETS.map((b) => {
          const meta = BUCKET_META[b];
          const bal = balances[b];
          const balance = Number(bal?.balance ?? 0);
          const isOverspent = balance < 0;
          const pctSpent = bal && Number(bal.allocated) > 0
            ? Math.min(100, (Number(bal.spent) / Number(bal.allocated)) * 100)
            : 0;

          const periodBkt = periodStats.byBucket[b];
          const hasPeriodActivity = period !== "all" && (periodBkt.allocated > 0 || periodBkt.spent > 0);

          return (
            <div key={b} className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div
                  className="size-10 rounded-xl grid place-items-center font-bold"
                  style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}
                >
                  {b}
                </div>
                <span className="text-xs text-muted-foreground">{meta.name}</span>
              </div>

              {/* All-time balance */}
              <p className={`text-2xl font-bold ${isOverspent ? "text-destructive" : ""}`}>
                {formatKES(balance)}
                {isOverspent && (
                  <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">over</span>
                )}
              </p>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pctSpent}%`,
                    backgroundColor: isOverspent ? "hsl(var(--destructive))" : `hsl(${meta.color})`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Spent {formatKES(Number(bal?.spent ?? 0))}</span>
                <span>of {formatKES(Number(bal?.allocated ?? 0))}</span>
              </div>

              {/* Period-specific activity */}
              {hasPeriodActivity && (
                <div className="mt-3 pt-2 border-t border-border space-y-0.5">
                  <p className="text-xs text-muted-foreground capitalize">{period === "week" ? "This week" : "This month"}</p>
                  {periodBkt.allocated > 0 && (
                    <p className="text-xs text-primary">+{formatKES(periodBkt.allocated)} in</p>
                  )}
                  {periodBkt.spent > 0 && (
                    <p className="text-xs text-muted-foreground">−{formatKES(periodBkt.spent)} out</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Transactions grouped by month */}
      <h2 className="text-lg font-semibold mb-4">
        Transactions
        {period !== "all" && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            · {period === "week" ? "This week" : "This month"}
          </span>
        )}
      </h2>

      {loading ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          {period !== "all"
            ? `No transactions ${period === "week" ? "this week" : "this month"} yet.`
            : "No transactions yet. Paystack payments land here automatically."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ key, label, items, income, spend }) => {
            const isOpen = expanded.has(key);
            return (
              <div key={key} className="glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    <span className="font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{items.length} transaction{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {income > 0 && <span className="text-primary font-medium">+{formatKES(income)}</span>}
                    {spend > 0 && <span className="text-muted-foreground font-medium">−{formatKES(spend)}</span>}
                  </div>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map(t => (
                      <li
                        key={t.id}
                        onClick={() => setDetailTx(t)}
                        className="flex items-center justify-between px-5 py-3 hover:bg-secondary/10 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-8 rounded-lg grid place-items-center flex-shrink-0 ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                            {t.type === "income" ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {t.description || (t.type === "income" ? "Payment received" : "Expense")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                              {t.type === "income" && t.parent_id === null ? " · tap to see splits" : ""}
                              {t.bucket ? ` · ${BUCKET_META[t.bucket].name}` : ""}
                            </p>
                          </div>
                        </div>
                        <p className={`text-sm font-semibold flex-shrink-0 ml-4 ${t.type === "income" ? "text-primary" : ""}`}>
                          {t.type === "income" ? "+" : "−"}{formatKES(Number(t.amount))}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TransactionDetailSheet transaction={detailTx} allRows={allRows} onClose={() => setDetailTx(null)} />
    </div>
  );
};

export default Dashboard;
