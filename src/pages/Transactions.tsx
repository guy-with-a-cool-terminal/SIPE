import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeftRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddExpenseModal } from "@/components/app/AddExpenseModal";
import { EditTransactionModal } from "@/components/app/EditTransactionModal";
import { TransactionDetailSheet } from "@/components/app/TransactionDetailSheet";
import { TransferModal } from "@/components/app/TransferModal";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
type Tab = "deposits" | "expenses";
type Period = "all" | "week" | "month";

const Transactions = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("deposits");
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<Bucket | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  // Sync period → date range
  useEffect(() => {
    if (period === "all") { setFrom(""); setTo(""); return; }
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(start.toISOString().slice(0, 10));
      setTo(todayStr);
    } else if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      setFrom(start.toISOString().slice(0, 10));
      setTo(todayStr);
    }
  }, [period]);

  // Deposits: parent income rows only
  const deposits = useMemo(() =>
    rows.filter(t => t.type === "income" && t.parent_id === null),
    [rows]
  );

  // Expenses: parent expense rows only (split children excluded)
  const expenses = useMemo(() =>
    rows.filter(t => t.type === "expense" && t.parent_id === null),
    [rows]
  );

  const activeRows = tab === "deposits" ? deposits : expenses;

  const filtered = useMemo(() => {
    return activeRows.filter(t => {
      if (tab === "expenses" && bucket !== "ALL" && t.bucket !== bucket) return false;
      if (q && !((t.description || "").toLowerCase().includes(q.toLowerCase()) || (t.category || "").toLowerCase().includes(q.toLowerCase()))) return false;
      if (from && new Date(t.occurred_at) < new Date(from)) return false;
      if (to && new Date(t.occurred_at) > new Date(to + "T23:59:59")) return false;
      const amt = Number(t.amount);
      if (minAmt && amt < Number(minAmt)) return false;
      if (maxAmt && amt > Number(maxAmt)) return false;
      return true;
    });
  }, [activeRows, tab, q, bucket, from, to, minAmt, maxAmt]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, t) => s + Number(t.amount), 0);
    const byBucket: Partial<Record<Bucket, number>> = {};
    if (tab === "expenses") {
      for (const t of filtered) {
        if (t.bucket) byBucket[t.bucket] = (byBucket[t.bucket] || 0) + Number(t.amount);
      }
    }
    return { count: filtered.length, total, byBucket };
  }, [filtered, tab]);

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setDeleteId(null);
    load();
  };

  const periodBtnClass = (p: Period) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-1">Every flow, in and out.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowTransfer(true)}
            className="border border-border text-foreground px-5 py-2.5 rounded-full font-semibold hover:bg-secondary/40 transition flex items-center gap-2"
          >
            <ArrowLeftRight className="size-4" /> Transfer
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-semibold hover:bg-primary-glow transition flex items-center gap-2"
          >
            <Plus className="size-4" /> Add expense
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6">
        {(["deposits", "expenses"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setBucket("ALL"); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition capitalize ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "deposits" ? `Deposits (${deposits.length})` : `Expenses (${expenses.length})`}
          </button>
        ))}
      </div>

      {/* Period quick-picker */}
      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-4">
        <button className={periodBtnClass("all")} onClick={() => setPeriod("all")}>All time</button>
        <button className={periodBtnClass("week")} onClick={() => setPeriod("week")}>This week</button>
        <button className={periodBtnClass("month")} onClick={() => setPeriod("month")}>This month</button>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-4 mb-4 grid md:grid-cols-6 gap-3">
        <div className="relative md:col-span-2">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or category"
            className="w-full pl-10 pr-3 py-2 bg-input border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {tab === "expenses" ? (
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value as Bucket | "ALL")}
            className="bg-input border border-border rounded-xl px-3 py-2 text-sm"
          >
            <option value="ALL">All buckets</option>
            {ALL_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_META[b].name}</option>)}
          </select>
        ) : (
          <div />
        )}
        <input
          type="date" value={from}
          onChange={(e) => { setFrom(e.target.value); setPeriod("all"); }}
          className="bg-input border border-border rounded-xl px-3 py-2 text-sm"
        />
        <input
          type="date" value={to}
          onChange={(e) => { setTo(e.target.value); setPeriod("all"); }}
          className="bg-input border border-border rounded-xl px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input type="number" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="Min" className="w-1/2 bg-input border border-border rounded-xl px-3 py-2 text-sm" />
          <input type="number" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder="Max" className="w-1/2 bg-input border border-border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Stats bar */}
      {stats.count > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <span className="text-muted-foreground">{stats.count} transaction{stats.count !== 1 ? "s" : ""}</span>
          <span className="text-muted-foreground">·</span>
          <span className={`font-semibold ${tab === "deposits" ? "text-primary" : ""}`}>
            {tab === "deposits" ? "+" : "−"}{formatKES(stats.total)}
          </span>
          {tab === "expenses" && Object.keys(stats.byBucket).length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <div className="flex flex-wrap gap-2">
                {(ALL_BUCKETS.filter(b => stats.byBucket[b]) as Bucket[]).map(b => (
                  <span
                    key={b}
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `hsl(${BUCKET_META[b].color} / 0.15)`, color: `hsl(${BUCKET_META[b].color})` }}
                  >
                    {BUCKET_META[b].name} {formatKES(stats.byBucket[b]!)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {tab === "deposits" ? "No deposits yet." : "No expenses yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-left px-4 py-3">
                    {tab === "deposits" ? "Source" : "Category"}
                  </th>
                  {tab === "expenses" && <th className="text-left px-4 py-3">Bucket</th>}
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setDetailTx(t)}
                    className="hover:bg-secondary/20 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      {t.description || (tab === "deposits" ? "Payment received" : "Expense")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.category === "Transfer" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">Transfer</span>
                      ) : tab === "deposits" ? (t.source || "—") : (t.category || "—")}
                    </td>
                    {tab === "expenses" && (
                      <td className="px-4 py-3">
                        {t.bucket
                          ? <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: `hsl(${BUCKET_META[t.bucket].color} / 0.15)`, color: `hsl(${BUCKET_META[t.bucket].color})` }}>{BUCKET_META[t.bucket].name}</span>
                          : <span className="text-muted-foreground text-xs italic">split</span>
                        }
                      </td>
                    )}
                    <td className={`px-4 py-3 text-right font-semibold ${tab === "deposits" ? "text-primary" : ""}`}>
                      {tab === "deposits" ? "+" : "−"}{formatKES(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditTx(t); }}
                          className="text-muted-foreground hover:text-foreground transition"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteId(t.id); }}
                          className="text-muted-foreground hover:text-destructive transition"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the transaction and any associated splits. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddExpenseModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} userId={user!.id} />
      <EditTransactionModal transaction={editTx} onClose={() => setEditTx(null)} onSaved={load} />
      <TransactionDetailSheet transaction={detailTx} allRows={rows} onClose={() => setDetailTx(null)} />
      <TransferModal open={showTransfer} onClose={() => setShowTransfer(false)} onSaved={load} userId={user!.id} />
    </div>
  );
};

export default Transactions;
