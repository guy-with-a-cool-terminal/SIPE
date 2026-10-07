import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ArrowLeftRight, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/Skeletons";
import { DataList, type Column } from "@/components/app/DataList";
import { AddExpenseModal } from "@/components/app/AddExpenseModal";
import { EditTransactionModal } from "@/components/app/EditTransactionModal";
import { TransactionDetailSheet } from "@/components/app/TransactionDetailSheet";
import { TransferModal } from "@/components/app/TransferModal";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];
const NO_ROWS: Transaction[] = [];
type Tab = "deposits" | "expenses";
type Period = "all" | "week" | "lastmonth" | "month";

const Transactions = () => {
  const { user } = useAuth();
  usePageTitle("Transactions");
  const queryClient = useQueryClient();
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

  const { data: rows = NO_ROWS, isLoading: loading } = useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Transaction[];
    },
  });

  const load = () => queryClient.invalidateQueries({ queryKey: ["transactions"] });

  // Sync period → date range
  useEffect(() => {
    if (period === "all") { setFrom(""); setTo(""); return; }
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(start.toISOString().slice(0, 10));
      setTo(todayStr);
    } else if (period === "lastmonth") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(start.toISOString().slice(0, 10));
      setTo(new Date(end.getTime() - 86400000).toISOString().slice(0, 10));
    } else if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      setFrom(start.toISOString().slice(0, 10));
      setTo(todayStr);
    }
  }, [period]);

  // Deposits: real income only — bucket === null excludes transfer income rows
  const deposits = useMemo(() =>
    rows.filter(t => t.type === "income" && t.parent_id === null && t.bucket === null),
    [rows]
  );

  // Expenses: real expenses only — no transfers
  const expenses = useMemo(() =>
    rows.filter(t => t.type === "expense" && t.parent_id === null && t.category !== "Transfer"),
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

  const exportCSV = () => {
    if (filtered.length === 0) return toast.error("Nothing to export");
    const headers = tab === "deposits"
      ? ["Date", "Description", "Source", "Amount (KES)"]
      : ["Date", "Description", "Category", "Bucket", "Amount (KES)"];
    const rows = filtered.map(t => {
      const date = new Date(t.occurred_at).toLocaleDateString("en-KE");
      const desc = t.description || (tab === "deposits" ? "Payment received" : "Expense");
      const amount = Number(t.amount).toFixed(2);
      if (tab === "deposits") return [date, desc, t.source || "", amount];
      return [date, desc, t.category || "", t.bucket ? BUCKET_META[t.bucket].name : "split", amount];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sipe-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const periodBtnClass = (p: Period) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  const txnColumns: Column<Transaction>[] = [
    {
      header: "Date",
      cell: (t) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      header: "Description",
      cell: (t) => t.description || (tab === "deposits" ? "Payment received" : "Expense"),
    },
    {
      header: tab === "deposits" ? "Source" : "Category",
      cell: (t) =>
        t.category === "Transfer" ? (
          <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">Transfer</span>
        ) : (
          <span className="text-muted-foreground">{tab === "deposits" ? (t.source || "—") : (t.category || "—")}</span>
        ),
    },
    ...(tab === "expenses"
      ? ([{
          header: "Bucket",
          cell: (t: Transaction) =>
            t.bucket ? (
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: `hsl(${BUCKET_META[t.bucket].color} / 0.15)`, color: `hsl(${BUCKET_META[t.bucket].color})` }}
              >
                {BUCKET_META[t.bucket].name}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">split</span>
            ),
        }] as Column<Transaction>[])
      : []),
    {
      header: "Amount",
      align: "right",
      cell: (t) => (
        <span className={`font-semibold ${tab === "deposits" ? "text-primary" : ""}`}>
          {tab === "deposits" ? "+" : "−"}{formatKES(Number(t.amount))}
        </span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setEditTx(t); }}
            aria-label="Edit transaction"
            className="text-muted-foreground hover:text-foreground transition"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(t.id); }}
            aria-label="Delete transaction"
            className="text-muted-foreground hover:text-destructive transition"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title="Transactions"
        subtitle="Every flow, in and out."
        actions={
          <>
            <button
              onClick={exportCSV}
              className="border border-border text-foreground px-4 py-2 rounded-full font-semibold text-sm hover:bg-secondary/40 transition flex items-center gap-2"
            >
              <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={() => setShowTransfer(true)}
              className="border border-border text-foreground px-4 py-2 rounded-full font-semibold text-sm hover:bg-secondary/40 transition flex items-center gap-2"
            >
              <ArrowLeftRight className="size-4" /> <span className="hidden sm:inline">Transfer</span>
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold text-sm hover:bg-primary-glow transition flex items-center gap-2"
            >
              <Plus className="size-4" /> Add<span className="hidden sm:inline"> expense</span>
            </button>
          </>
        }
      />

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
      <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit max-w-full overflow-x-auto mb-4">
        <button className={periodBtnClass("all")} onClick={() => setPeriod("all")}>All time</button>
        <button className={periodBtnClass("week")} onClick={() => setPeriod("week")}>This week</button>
        <button className={periodBtnClass("lastmonth")} onClick={() => setPeriod("lastmonth")}>Last month</button>
        <button className={periodBtnClass("month")} onClick={() => setPeriod("month")}>This month</button>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div className="relative col-span-2 sm:col-span-3 md:col-span-2">
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
        <div className="col-span-2 sm:col-span-1 flex gap-2">
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
          <ListSkeleton rows={8} plain />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {tab === "deposits" ? "No deposits yet." : "No expenses yet."}
          </div>
        ) : (
          <DataList
            rows={filtered}
            keyOf={(t) => t.id}
            onRowClick={(t) => setDetailTx(t)}
            columns={txnColumns}
            renderCard={(t) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.description || (tab === "deposits" ? "Payment received" : "Expense")}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                    <span>{new Date(t.occurred_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
                    {t.category === "Transfer" ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">Transfer</span>
                    ) : (tab === "deposits" ? t.source : t.category) ? (
                      <span>· {tab === "deposits" ? t.source : t.category}</span>
                    ) : null}
                    {tab === "expenses" && t.bucket && (
                      <span
                        className="px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `hsl(${BUCKET_META[t.bucket].color} / 0.15)`, color: `hsl(${BUCKET_META[t.bucket].color})` }}
                      >
                        {BUCKET_META[t.bucket].name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${tab === "deposits" ? "text-primary" : ""}`}>
                    {tab === "deposits" ? "+" : "−"}{formatKES(Number(t.amount))}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTx(t); }}
                      aria-label="Edit transaction"
                      className="p-2 -m-1 text-muted-foreground hover:text-foreground transition"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(t.id); }}
                      aria-label="Delete transaction"
                      className="p-2 -m-1 text-muted-foreground hover:text-destructive transition"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
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
