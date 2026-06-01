import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type BucketBalance, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Info, Plus, X } from "lucide-react";
import { DepositModal } from "@/components/app/DepositModal";
import { TransactionDetailSheet } from "@/components/app/TransactionDetailSheet";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
type Period = "all" | "week" | "lastmonth" | "month";

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
  const [limits, setLimits] = useState<Partial<Record<Bucket, number>>>({});
  const [committed, setCommitted] = useState<Partial<Record<Bucket, number>>>({});
  // Which bucket cards are expanded (showing detail)
  const [expandedCards, setExpandedCards] = useState<Set<Bucket>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [balRes, recentRes, monthRes, settingsRes, templatesRes] = await Promise.all([
        supabase.from("bucket_balances").select("*").eq("user_id", user.id),
        supabase.from("transactions")
          .select("*")
          .order("occurred_at", { ascending: false })
          .limit(300),
        supabase.from("transactions")
          .select("type,amount,parent_id")
          .is("parent_id", null)
          .neq("category", "Transfer")
          .gte("occurred_at", monthStart.toISOString()),
        supabase.from("allocation_settings")
          .select("savings_limit,invest_limit,pay_limit,expenses_limit")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("expense_templates")
          .select("bucket,amount")
          .eq("user_id", user.id),
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

      if (settingsRes.data) {
        const s = settingsRes.data;
        setLimits({
          S: s.savings_limit  != null ? Number(s.savings_limit)  : undefined,
          I: s.invest_limit   != null ? Number(s.invest_limit)   : undefined,
          P: s.pay_limit      != null ? Number(s.pay_limit)      : undefined,
          E: s.expenses_limit != null ? Number(s.expenses_limit) : undefined,
        });
      }

      const committedMap: Partial<Record<Bucket, number>> = {};
      (templatesRes.data || []).forEach((t: { bucket: string; amount: number }) => {
        const b = t.bucket as Bucket;
        committedMap[b] = (committedMap[b] || 0) + Number(t.amount);
      });
      setCommitted(committedMap);

      setLoading(false);
    })();
  }, [user, reloadKey]);

  const totalBalance = ALL_BUCKETS.reduce((s, b) => s + Number(balances[b]?.balance || 0), 0);

  const periodRange = useMemo((): { start: Date | null; end: Date | null } => {
    if (period === "all") return { start: null, end: null };
    const now = new Date();
    if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    if (period === "lastmonth") return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end:   new Date(now.getFullYear(), now.getMonth(), 1),
    };
    const s = new Date(now);
    s.setDate(now.getDate() - now.getDay());
    s.setHours(0, 0, 0, 0);
    return { start: s, end: null };
  }, [period]);

  const filterByRange = (rows: Transaction[]) => {
    const { start, end } = periodRange;
    if (!start && !end) return rows;
    return rows.filter(r => {
      const d = new Date(r.occurred_at);
      if (start && d < start) return false;
      if (end   && d >= end)  return false;
      return true;
    });
  };

  const periodStats = useMemo(() => {
    const rows = filterByRange(allRows);
    let income = 0, spend = 0;
    const byBucket = Object.fromEntries(
      ALL_BUCKETS.map(b => [b, { allocated: 0, spent: 0, actualSpent: 0 }])
    ) as Record<Bucket, { allocated: number; spent: number; actualSpent: number }>;

    for (const r of rows) {
      if (r.parent_id === null && r.type === "income" && r.category !== "Transfer") income += Number(r.amount);
      if (r.parent_id === null && r.type === "expense" && r.category !== "Transfer") spend += Number(r.amount);
      if (r.bucket) {
        if (r.type === "income") byBucket[r.bucket].allocated += Number(r.amount);
        if (r.type === "expense") {
          byBucket[r.bucket].spent += Number(r.amount);
          if (r.category !== "Transfer") byBucket[r.bucket].actualSpent += Number(r.amount);
        }
      }
    }
    return { income, spend, byBucket };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, periodRange]);

  const displayIncome = period === "all" ? monthIncome : periodStats.income;
  const displaySpend  = period === "all" ? monthSpend  : periodStats.spend;

  const periodLabel = period === "week" ? "this week"
    : period === "lastmonth" ? "last month"
    : "this month";

  const openingBalance = period !== "all"
    ? totalBalance + displaySpend - displayIncome
    : null;

  const bucketOpening = (b: Bucket) =>
    Number(balances[b]?.balance ?? 0)
    + periodStats.byBucket[b].spent
    - periodStats.byBucket[b].allocated;

  const filteredRecent = useMemo(() => filterByRange(recent),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [recent, periodRange]);

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

  const toggleGroup = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleCard = (b: Bucket) =>
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(b) ? next.delete(b) : next.add(b);
      return next;
    });

  const periodBtnClass = (p: Period) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Welcome back, {firstName}</h1>
        <button
          onClick={() => setShowDeposit(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition flex items-center gap-2 text-sm"
        >
          <Plus className="size-4" /> Deposit earnings
        </button>
      </div>

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} onSaved={() => setReloadKey(k => k + 1)} />

      {/* Period picker */}
      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-5">
        <button className={periodBtnClass("all")} onClick={() => setPeriod("all")}>All time</button>
        <button className={periodBtnClass("week")} onClick={() => setPeriod("week")}>This week</button>
        <button className={periodBtnClass("month")} onClick={() => setPeriod("month")}>This month</button>
        <button className={periodBtnClass("lastmonth")} onClick={() => setPeriod("lastmonth")}>Last month</button>
      </div>

      {/* Summary row — always 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance</p>
          <p className={`text-2xl font-bold mt-1 ${totalBalance < 0 ? "text-destructive" : ""}`}>
            {formatKES(totalBalance)}
          </p>
          {openingBalance !== null && openingBalance !== totalBalance && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Opened with <span className="text-foreground">{formatKES(openingBalance)}</span>
              {displaySpend > displayIncome && (
                <span className={` · ${displaySpend <= openingBalance + displayIncome ? "text-primary" : "text-destructive"}`}>
                  {displaySpend <= openingBalance + displayIncome ? "still positive" : "exceeded"}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
            <ArrowDownRight className="size-3 text-primary" /> In {periodLabel}
          </div>
          <p className="text-2xl font-bold mt-1">{formatKES(displayIncome)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
            <ArrowUpRight className="size-3" /> Out {periodLabel}
          </div>
          <p className="text-2xl font-bold mt-1">{formatKES(displaySpend)}</p>
          {displaySpend > displayIncome && openingBalance !== null && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {formatKES(displaySpend - displayIncome)} from carry-over
            </p>
          )}
        </div>
      </div>

      {/* Bucket cards — always 4-wide on desktop */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        {ALL_BUCKETS.map((b) => {
          const meta = BUCKET_META[b];
          const bal = balances[b];
          const balance = Number(bal?.balance ?? 0);
          const isOverspent = balance < 0;
          const spent = Number(bal?.spent ?? 0);

          const limit = limits[b];
          const hasLimit = limit !== undefined && limit > 0;
          const denominator = hasLimit ? limit : Number(bal?.allocated ?? 0);
          const pctSpent = denominator > 0 ? Math.min(100, (spent / denominator) * 100) : 0;

          const barColor = hasLimit
            ? pctSpent >= 100 ? "hsl(var(--destructive))"
              : pctSpent >= 80  ? "hsl(var(--warning))"
              : `hsl(${meta.color})`
            : isOverspent ? "hsl(var(--destructive))" : `hsl(${meta.color})`;

          const isCardExpanded = expandedCards.has(b);
          const periodBkt = periodStats.byBucket[b];
          const hasPeriodActivity = period !== "all" && (periodBkt.allocated > 0 || periodBkt.actualSpent > 0);

          return (
            <div key={b} className="glass rounded-xl p-4">
              {/* Card header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="size-8 rounded-lg grid place-items-center font-bold text-sm"
                    style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}
                  >
                    {b}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">{meta.name}</span>
                </div>
                <button
                  onClick={() => toggleCard(b)}
                  className={`p-1 rounded-md transition ${isCardExpanded ? "text-primary bg-primary/10" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                  title={isCardExpanded ? "Hide details" : "Show details"}
                >
                  {isCardExpanded ? <X className="size-3.5" /> : <Info className="size-3.5" />}
                </button>
              </div>

              {/* Balance */}
              <p className={`text-xl font-bold ${isOverspent ? "text-destructive" : ""}`}>
                {formatKES(balance)}
                {isOverspent && (
                  <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">over</span>
                )}
              </p>

              {/* Progress bar */}
              <div className="mt-2.5 h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pctSpent}%`, backgroundColor: barColor }}
                />
              </div>

              {/* Compact bill shortfall warning (collapsed state) */}
              {!isCardExpanded && (committed[b] ?? 0) > 0 && balance < (committed[b] ?? 0) && (
                <p className="mt-1.5 text-xs text-destructive font-medium">
                  Short {formatKES((committed[b] ?? 0) - balance)} for bills
                </p>
              )}

              {/* Expanded detail */}
              {isCardExpanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Spent</span>
                    <span className="text-foreground tabular-nums">{formatKES(spent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{hasLimit ? "Monthly limit" : "Allocated"}</span>
                    <span className="tabular-nums">{formatKES(denominator)}</span>
                  </div>
                  {(committed[b] ?? 0) > 0 && (() => {
                    const committedAmt = committed[b]!;
                    const freeBalance = balance - committedAmt;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Committed bills</span>
                          <span className="tabular-nums">{formatKES(committedAmt)}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          {freeBalance >= 0 ? (
                            <>
                              <span className="text-primary">After bills</span>
                              <span className="text-primary tabular-nums">{formatKES(freeBalance)} free</span>
                            </>
                          ) : (
                            <>
                              <span className="text-destructive">Bill shortfall</span>
                              <span className="text-destructive tabular-nums">−{formatKES(Math.abs(freeBalance))}</span>
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  {hasPeriodActivity && (() => {
                    const bktOpen = bucketOpening(b);
                    return (
                      <>
                        <div className="pt-1 border-t border-border/50 text-muted-foreground/70 capitalize">{periodLabel}</div>
                        {bktOpen > 0 && (
                          <div className="flex justify-between">
                            <span>Started with</span>
                            <span className="tabular-nums">{formatKES(bktOpen)}</span>
                          </div>
                        )}
                        {periodBkt.allocated > 0 && (
                          <div className="flex justify-between">
                            <span>In</span>
                            <span className="text-primary tabular-nums">+{formatKES(periodBkt.allocated)}</span>
                          </div>
                        )}
                        {periodBkt.actualSpent > 0 && (
                          <div className="flex justify-between">
                            <span>Out</span>
                            <span className="tabular-nums">−{formatKES(periodBkt.actualSpent)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Transactions */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">
          Transactions
          {period !== "all" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {periodLabel}</span>
          )}
        </h2>
      </div>

      {loading ? (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">
          {period !== "all"
            ? `No transactions ${periodLabel} yet.`
            : "No transactions yet. Paystack payments land here automatically."}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(({ key, label, items, income, spend }) => {
            const isOpen = expanded.has(key);
            return (
              <div key={key} className="glass rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition"
                >
                  <div className="flex items-center gap-2.5">
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    <span className="font-medium text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground">{items.length} tx</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {income > 0 && <span className="text-primary font-medium tabular-nums">+{formatKES(income)}</span>}
                    {spend > 0 && <span className="text-muted-foreground tabular-nums">−{formatKES(spend)}</span>}
                  </div>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map(t => (
                      <li
                        key={t.id}
                        onClick={() => setDetailTx(t)}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/10 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-7 rounded-lg grid place-items-center flex-shrink-0 ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                            {t.type === "income" ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {t.description || (t.type === "income" ? "Payment received" : "Expense")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                              {t.type === "income" && t.parent_id === null ? " · tap for splits" : ""}
                              {t.bucket ? ` · ${BUCKET_META[t.bucket].name}` : ""}
                            </p>
                          </div>
                        </div>
                        <p className={`text-sm font-semibold flex-shrink-0 ml-4 tabular-nums ${t.type === "income" ? "text-primary" : ""}`}>
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
