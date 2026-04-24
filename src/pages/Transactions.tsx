import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Trash2, X } from "lucide-react";
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

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
type Tab = "deposits" | "expenses";

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
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  // Deposits: parent income rows only (no bucket split children)
  const deposits = useMemo(() =>
    rows.filter(t => t.type === "income" && t.parent_id === null),
    [rows]
  );

  // Expenses: all expense rows
  const expenses = useMemo(() =>
    rows.filter(t => t.type === "expense"),
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

  const addExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      user_id: user!.id,
      type: "expense" as const,
      bucket: fd.get("bucket") as Bucket,
      amount: Number(fd.get("amount")),
      category: String(fd.get("category") || "") || null,
      description: String(fd.get("description") || "") || null,
      occurred_at: new Date(String(fd.get("date") || new Date().toISOString().slice(0, 10))).toISOString(),
    };
    if (!payload.amount || payload.amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Expense added");
    setShowAdd(false);
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    setRows(r => r.filter(t => t.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-1">Every flow, in and out.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-semibold hover:bg-primary-glow transition flex items-center gap-2"
        >
          <Plus className="size-4" /> Add expense
        </button>
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

      {/* Filters */}
      <div className="glass rounded-2xl p-4 mb-6 grid md:grid-cols-6 gap-3">
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
          <div /> /* placeholder to keep grid alignment */
        )}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-input border border-border rounded-xl px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-input border border-border rounded-xl px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input type="number" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="Min" className="w-1/2 bg-input border border-border rounded-xl px-3 py-2 text-sm" />
          <input type="number" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder="Max" className="w-1/2 bg-input border border-border rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>

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
                  <tr key={t.id} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      {t.description || (tab === "deposits" ? "Payment received" : "Expense")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tab === "deposits" ? (t.source || "—") : (t.category || "—")}
                    </td>
                    {tab === "expenses" && (
                      <td className="px-4 py-3">
                        {t.bucket
                          ? <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: `hsl(${BUCKET_META[t.bucket].color} / 0.15)`, color: `hsl(${BUCKET_META[t.bucket].color})` }}>{BUCKET_META[t.bucket].name}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                    )}
                    <td className={`px-4 py-3 text-right font-semibold ${tab === "deposits" ? "text-primary" : ""}`}>
                      {tab === "deposits" ? "+" : "−"}{formatKES(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteId(t.id)} className="text-muted-foreground hover:text-destructive transition">
                        <Trash2 className="size-4" />
                      </button>
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
              This will permanently remove the transaction. This action cannot be undone.
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

      {/* Add expense modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <form onSubmit={addExpense} onClick={(e) => e.stopPropagation()} className="glass rounded-3xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Add expense</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm text-muted-foreground">Amount (KES)</span>
                <input name="amount" type="number" step="0.01" required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Bucket</span>
                <select name="bucket" required defaultValue="E" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5">
                  {ALL_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_META[b].name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Category</span>
                <input name="category" placeholder="e.g. Software, Tax, Coffee" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Description</span>
                <input name="description" placeholder="Optional" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Date</span>
                <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
              </label>
            </div>
            <button type="submit" className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition">
              Add expense
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Transactions;
