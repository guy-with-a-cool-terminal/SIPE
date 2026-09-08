import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Account, type AccountBalance, type Bucket, type BucketBalance, type ExpenseTemplate, type Transaction } from "@/integrations/supabase/types";
import { reconcileDiff } from "@/lib/accounts";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Info, Plus, Wallet, X } from "lucide-react";
import { DepositModal } from "@/components/app/DepositModal";
import { TransactionDetailSheet } from "@/components/app/TransactionDetailSheet";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton, ListSkeleton } from "@/components/app/Skeletons";

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
  usePageTitle("Dashboard");
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
  const [goals, setGoals] = useState<Partial<Record<Bucket, number>>>({});
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [cashByLocation, setCashByLocation] = useState<{ name: string; balance: number }[]>([]);
  // Which bucket cards are expanded (showing detail)
  const [expandedCards, setExpandedCards] = useState<Set<Bucket>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [balRes, recentRes, monthRes, settingsRes, templatesRes, acctRes, acctBalRes, goalsRes] = await Promise.all([
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
          .select("*")
          .eq("user_id", user.id),
        supabase.from("accounts").select("id,name,archived").eq("user_id", user.id),
        supabase.from("account_balances").select("account_id,balance").eq("user_id", user.id),
        supabase.from("goals").select("bucket,target_amount").eq("user_id", user.id).eq("funding", "bucket").eq("status", "active"),
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

      // Bucket goal bars read from the goals table (funding='bucket', active). The bar
      // math below compares the live bucket balance against target_amount.
      const gmap: Partial<Record<Bucket, number>> = {};
      ((goalsRes.data as { bucket: Bucket | null; target_amount: number }[] | null) || []).forEach(g => {
        if (g.bucket) gmap[g.bucket] = Number(g.target_amount);
      });
      setGoals(gmap);

      setTemplates(templatesRes.data || []);

      const acctBalMap: Record<string, number> = {};
      (acctBalRes.data || []).forEach((r: Pick<AccountBalance, "account_id" | "balance">) => {
        acctBalMap[r.account_id] = Number(r.balance);
      });
      const cash = ((acctRes.data as Pick<Account, "id" | "name" | "archived">[] | null) || [])
        .filter(a => !a.archived)
        .map(a => ({ name: a.name, balance: acctBalMap[a.id] ?? 0 }))
        .sort((x, y) => y.balance - x.balance);
      setCashByLocation(cash);

      setLoading(false);
    })();
  }, [user, reloadKey]);

  const totalBalance = ALL_BUCKETS.reduce((s, b) => s + Number(balances[b]?.balance || 0), 0);

  const cashTotal = cashByLocation.reduce((s, c) => s + c.balance, 0);
  const cashDiff = reconcileDiff(cashTotal, totalBalance);
  const cashUnreconciled = Math.abs(cashDiff) > 1;

  // Total committed bills per bucket (ignoring payments)
  const committed = useMemo(() => {
    const map: Partial<Record<Bucket, number>> = {};
    for (const t of templates) {
      map[t.bucket] = (map[t.bucket] || 0) + Number(t.amount);
    }
    return map;
  }, [templates]);

  // How much of each template has been paid this calendar month (via template_id link)
  const thisMonthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const remainingCommitted = useMemo(() => {
    const paid: Record<string, number> = {};
    for (const r of allRows) {
      if (r.type !== "expense" || new Date(r.occurred_at) < thisMonthStart) continue;
      if (r.template_id) {
        // Linked payment (new flow)
        paid[r.template_id] = (paid[r.template_id] || 0) + Number(r.amount);
      } else if (r.bucket && r.description) {
        // Fallback: match by bucket + description for pre-migration payments
        const match = templates.find(t =>
          t.bucket === r.bucket &&
          t.name.toLowerCase() === r.description!.toLowerCase()
        );
        if (match) paid[match.id] = (paid[match.id] || 0) + Number(r.amount);
      }
    }
    const map: Partial<Record<Bucket, number>> = {};
    for (const t of templates) {
      const remaining = Math.max(0, Number(t.amount) - (paid[t.id] || 0));
      map[t.bucket] = (map[t.bucket] || 0) + remaining;
    }
    return map;
  }, [templates, allRows, thisMonthStart]);

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
      ALL_BUCKETS.map(b => [b, { allocated: 0, actualAllocated: 0, spent: 0, actualSpent: 0 }])
    ) as Record<Bucket, { allocated: number; actualAllocated: number; spent: number; actualSpent: number }>;

    for (const r of rows) {
      if (r.parent_id === null && r.type === "income" && r.category !== "Transfer") income += Number(r.amount);
      if (r.parent_id === null && r.type === "expense" && r.category !== "Transfer") spend += Number(r.amount);
      if (r.bucket) {
        const b = r.bucket as Bucket;
        if (r.type === "income") {
          byBucket[b].allocated += Number(r.amount); // includes transfers, used for opening balance math
          if (r.category !== "Transfer") byBucket[b].actualAllocated += Number(r.amount);
        }
        if (r.type === "expense") {
          byBucket[b].spent += Number(r.amount); // includes transfers, used for opening balance math
          if (r.category !== "Transfer") byBucket[b].actualSpent += Number(r.amount);
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
      if (t.type === "income" && t.category !== "Transfer") g.income += Number(t.amount);
      else if (t.type === "expense" && t.category !== "Transfer") g.spend += Number(t.amount);
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
    `px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  const depositButton = (
    <button
      onClick={() => setShowDeposit(true)}
      className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition flex items-center gap-2 text-sm"
    >
      <Plus className="size-4" /> Deposit<span className="hidden sm:inline"> earnings</span>
    </button>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
        <PageHeader title={`Welcome back, ${firstName}`} actions={depositButton} />
        <div className="space-y-5">
          <CardGridSkeleton count={3} className="grid grid-cols-1 sm:grid-cols-3 gap-3" />
          <CardGridSkeleton count={4} className="grid grid-cols-2 xl:grid-cols-4 gap-3" />
          <ListSkeleton rows={5} />
        </div>
        <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} onSaved={() => setReloadKey(k => k + 1)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader title={`Welcome back, ${firstName}`} actions={depositButton} />

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} onSaved={() => setReloadKey(k => k + 1)} />

      {/* Period picker */}
      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit max-w-full overflow-x-auto mb-5">
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

      {/* Cash by location */}
      {cashByLocation.length > 0 && (
        <div className="glass rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <Wallet className="size-3" /> Cash by location
            </div>
            <Link to="/accounts" className="text-xs text-primary hover:text-primary/80 font-medium">Manage →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cashByLocation.slice(0, 4).map((c) => (
              <div key={c.name}>
                <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                <p className={`text-sm font-semibold tabular-nums ${c.balance < 0 ? "text-destructive" : ""}`}>{formatKES(c.balance)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2 text-xs flex-wrap">
            <span className="tabular-nums">Accounts {formatKES(cashTotal)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums">Buckets {formatKES(totalBalance)}</span>
            <span className="text-muted-foreground">·</span>
            <span className={`tabular-nums font-semibold ${cashUnreconciled ? "text-destructive" : "text-primary"}`}>
              Δ {cashDiff > 0 ? "+" : cashDiff < 0 ? "−" : ""}{formatKES(Math.abs(cashDiff))}
            </span>
            {cashUnreconciled && (
              <Link to="/accounts" className="text-primary hover:text-primary/80 font-medium ml-auto">Reconcile</Link>
            )}
          </div>
        </div>
      )}

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
          const hasPeriodActivity = period !== "all" && (periodBkt.actualAllocated > 0 || periodBkt.actualSpent > 0);

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
              {!isCardExpanded && (remainingCommitted[b] ?? 0) > 0 && balance < (remainingCommitted[b] ?? 0) && (
                <p className="mt-1.5 text-xs text-destructive font-medium">
                  Short {formatKES((remainingCommitted[b] ?? 0) - balance)} for bills
                </p>
              )}

              {/* Savings goal progress */}
              {goals[b] !== undefined && goals[b]! > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Goal</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.min(100, Math.round((balance / goals[b]!) * 100))}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, (balance / goals[b]!) * 100))}%`,
                        backgroundColor: balance >= goals[b]! ? "hsl(var(--primary))" : `hsl(${meta.color} / 0.6)`,
                      }}
                    />
                  </div>
                  {balance >= goals[b]! && (
                    <p className="mt-1 text-xs text-primary font-medium">Goal reached</p>
                  )}
                </div>
              )}

              {/* Expanded detail */}
              {isCardExpanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground">
                  {goals[b] !== undefined && goals[b]! > 0 && (
                    <div className="flex justify-between font-medium">
                      <span className={balance >= goals[b]! ? "text-primary" : ""}>
                        {balance >= goals[b]! ? "Goal reached" : "Goal target"}
                      </span>
                      <span className={`tabular-nums ${balance >= goals[b]! ? "text-primary" : ""}`}>
                        {formatKES(goals[b]!)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Spent</span>
                    <span className="text-foreground tabular-nums">{formatKES(spent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{hasLimit ? "Monthly limit" : "Allocated"}</span>
                    <span className="tabular-nums">{formatKES(denominator)}</span>
                  </div>
                  {(committed[b] ?? 0) > 0 && (() => {
                    const totalCommitted = committed[b]!;
                    const remaining = remainingCommitted[b] ?? 0;
                    const paidSoFar = totalCommitted - remaining;
                    const allPaid = remaining === 0;
                    const freeBalance = balance - remaining;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Committed bills</span>
                          <span className="tabular-nums">{formatKES(totalCommitted)}</span>
                        </div>
                        {paidSoFar > 0 && !allPaid && (
                          <div className="flex justify-between text-primary/70">
                            <span>Paid this month</span>
                            <span className="tabular-nums">−{formatKES(paidSoFar)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-medium">
                          {allPaid ? (
                            <>
                              <span className="text-primary">Bills covered</span>
                              <span className="text-primary">✓</span>
                            </>
                          ) : freeBalance >= 0 ? (
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
                        {periodBkt.actualAllocated > 0 && (
                          <div className="flex justify-between">
                            <span>In</span>
                            <span className="text-primary tabular-nums">+{formatKES(periodBkt.actualAllocated)}</span>
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
