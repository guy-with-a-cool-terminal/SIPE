import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type BucketBalance, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { DepositModal } from "@/components/app/DepositModal";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];

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
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthSpend, setMonthSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [balRes, recentRes, monthRes] = await Promise.all([
        supabase.from("bucket_balances").select("*").eq("user_id", user.id),
        // Only parent rows: deposits (income, parent_id IS NULL) and expenses
        supabase.from("transactions")
          .select("*")
          .is("parent_id", null)
          .order("occurred_at", { ascending: false })
          .limit(120),
        supabase.from("transactions")
          .select("type,amount,parent_id")
          .is("parent_id", null)
          .gte("occurred_at", monthStart.toISOString()),
      ]);

      const map = {} as Record<Bucket, BucketBalance>;
      ALL_BUCKETS.forEach(b => { map[b] = { user_id: user.id, bucket: b, allocated: 0, spent: 0, balance: 0 }; });
      (balRes.data || []).forEach((r: BucketBalance) => { map[r.bucket] = r; });
      setBalances(map);

      const rows: Transaction[] = recentRes.data || [];
      setRecent(rows);

      // Expand current month by default
      if (rows.length > 0) {
        setExpanded(new Set([monthKey(rows[0].occurred_at)]));
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

  // Group recent transactions by month
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Transaction[]; income: number; spend: number }>();
    for (const t of recent) {
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
  }, [recent]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
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

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="glass rounded-2xl p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total balance</p>
          <p className="text-3xl font-bold mt-2">{formatKES(totalBalance)}</p>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ArrowDownRight className="size-3.5 text-primary" /> Income this month
          </div>
          <p className="text-3xl font-bold mt-2">{formatKES(monthIncome)}</p>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ArrowUpRight className="size-3.5" /> Spent this month
          </div>
          <p className="text-3xl font-bold mt-2">{formatKES(monthSpend)}</p>
        </div>
      </div>

      {/* Buckets */}
      <h2 className="text-lg font-semibold mb-4">Buckets</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {ALL_BUCKETS.map((b) => {
          const meta = BUCKET_META[b];
          const bal = balances[b];
          const pctSpent = bal && bal.allocated > 0 ? Math.min(100, (Number(bal.spent) / Number(bal.allocated)) * 100) : 0;
          return (
            <div key={b} className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="size-10 rounded-xl grid place-items-center font-bold" style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}>{b}</div>
                <span className="text-xs text-muted-foreground">{meta.name}</span>
              </div>
              <p className="text-2xl font-bold">{formatKES(Number(bal?.balance || 0))}</p>
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pctSpent}%`, backgroundColor: `hsl(${meta.color})` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Spent {formatKES(Number(bal?.spent || 0))}</span>
                <span>of {formatKES(Number(bal?.allocated || 0))}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transactions grouped by month */}
      <h2 className="text-lg font-semibold mb-4">Transactions</h2>
      {loading ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No transactions yet. Paystack payments land here automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ key, label, items, income, spend }) => {
            const isOpen = expanded.has(key);
            return (
              <div key={key} className="glass rounded-2xl overflow-hidden">
                {/* Month header — always visible, click to expand/collapse */}
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

                {/* Individual transactions */}
                {isOpen && (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map(t => (
                      <li key={t.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-8 rounded-lg grid place-items-center flex-shrink-0 ${t.type === "income" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                            {t.type === "income" ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.description || (t.type === "income" ? "Payment received" : "Expense")}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
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
    </div>
  );
};

export default Dashboard;
