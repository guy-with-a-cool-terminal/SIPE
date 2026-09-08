import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Debt, type DebtPayment } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Direction = "owe" | "owed";
const emptyForm = { party: "", description: "", amount: "", due_date: "" };

const Debts = () => {
  const { user } = useAuth();
  usePageTitle("Debts");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettled, setShowSettled] = useState(false);

  // Add debt form
  const [addDir, setAddDir] = useState<Direction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Record payment
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [savingPay, setSavingPay] = useState(false);

  // Expanded payment history per debt
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    const [debtsRes, paymentsRes] = await Promise.all([
      supabase.from("debts").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("debt_payments").select("*").eq("user_id", user!.id).order("paid_at", { ascending: true }),
    ]);
    if (debtsRes.error) toast.error(debtsRes.error.message);
    setDebts(debtsRes.data || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const paidFor = (debtId: string) =>
    payments.filter(p => p.debt_id === debtId).reduce((s, p) => s + Number(p.amount), 0);

  const remaining = (debt: Debt) => Math.max(0, Number(debt.amount) - paidFor(debt.id));

  const saveDebt = async () => {
    if (!form.party.trim()) return toast.error("Enter a name");
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const { error } = await supabase.from("debts").insert({
      user_id: user!.id,
      direction: addDir,
      party: form.party.trim(),
      description: form.description.trim() || null,
      amount,
      due_date: form.due_date || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Added");
    setAddDir(null);
    setForm(emptyForm);
    load();
  };

  const recordPayment = async (debt: Debt) => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    const rem = remaining(debt);
    if (amount > rem + 0.01) return toast.error(`Max remaining is ${formatKES(rem)}`);
    setSavingPay(true);
    const { error } = await supabase.from("debt_payments").insert({
      debt_id: debt.id,
      user_id: user!.id,
      amount,
      note: payNote.trim() || null,
    });
    if (error) { setSavingPay(false); return toast.error(error.message); }
    if (amount >= rem - 0.01) {
      await supabase.from("debts")
        .update({ settled: true, settled_at: new Date().toISOString() })
        .eq("id", debt.id);
      toast.success("Fully settled!");
    } else {
      toast.success(`Payment recorded · ${formatKES(rem - amount)} remaining`);
    }
    setSavingPay(false);
    setPayingDebtId(null);
    setPayAmount("");
    setPayNote("");
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("debts").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setDeleteId(null);
    load();
  };

  const toggleHistory = (id: string) =>
    setExpandedHistory(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const formatDue = (due: string | null) => {
    if (!due) return null;
    const d = new Date(due);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      label: d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }),
      overdue: d < today,
    };
  };

  const active = debts.filter(d => !d.settled);
  const settled = debts.filter(d => d.settled);
  const iOwe   = active.filter(d => d.direction === "owe");
  const owedMe = active.filter(d => d.direction === "owed");
  const totalOwe  = iOwe.reduce((s, d) => s + remaining(d), 0);
  const totalOwed = owedMe.reduce((s, d) => s + remaining(d), 0);
  const net = totalOwed - totalOwe;

  const renderDebt = (d: Debt, dir: Direction) => {
    const paid = paidFor(d.id);
    const rem = remaining(d);
    const pct = Number(d.amount) > 0 ? Math.min(100, (paid / Number(d.amount)) * 100) : 0;
    const due = formatDue(d.due_date);
    const debtPayments = payments.filter(p => p.debt_id === d.id);
    const isPayingThis = payingDebtId === d.id;
    const historyOpen = expandedHistory.has(d.id);

    return (
      <div key={d.id} className="rounded-xl bg-secondary/20 border border-border overflow-hidden">
        <div className="flex items-start gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{d.party}</span>
              {due && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${due.overdue ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                  {due.overdue ? "overdue · " : ""}{due.label}
                </span>
              )}
            </div>
            {d.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</p>}
            {paid > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Paid {formatKES(paid)}</span>
                  <span>{rem > 0 ? `${formatKES(rem)} left` : "fully paid"}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 100 ? "hsl(var(--primary))" : `hsl(var(--primary) / 0.6)`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 text-right">
            <p className={`text-sm font-semibold tabular-nums ${dir === "owed" ? "text-primary" : ""}`}>
              {dir === "owed" ? "+" : "−"}{formatKES(rem > 0 ? rem : Number(d.amount))}
            </p>
            {paid > 0 && rem > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">of {formatKES(Number(d.amount))}</p>
            )}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {rem > 0 && (
              <button
                onClick={() => {
                  setPayingDebtId(isPayingThis ? null : d.id);
                  setPayAmount("");
                  setPayNote("");
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-primary transition text-xs font-medium px-2"
                title="Record payment"
              >
                Pay
              </button>
            )}
            {debtPayments.length > 0 && (
              <button
                onClick={() => toggleHistory(d.id)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition"
                title="Payment history"
              >
                {historyOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            )}
            <button
              onClick={() => setDeleteId(d.id)}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive transition"
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Inline pay form */}
        {isPayingThis && (
          <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0">
            <div className="flex gap-2 mt-3">
              <input
                type="number" min={0} step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder={`Amount (max ${formatKES(rem)})`}
                className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                autoFocus
              />
              <input
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
                placeholder="Note (optional)"
                className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => recordPayment(d)}
                disabled={savingPay}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary-glow transition disabled:opacity-50"
              >
                {savingPay ? "…" : <Check className="size-4" />}
              </button>
              <button
                onClick={() => setPayingDebtId(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Payment history */}
        {historyOpen && debtPayments.length > 0 && (
          <div className="border-t border-border/50 divide-y divide-border/40">
            {debtPayments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-primary flex-shrink-0" />
                  <span>{new Date(p.paid_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {p.note && <span className="text-muted-foreground/60">· {p.note}</span>}
                </div>
                <span className="tabular-nums font-medium text-foreground">{formatKES(Number(p.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader title="Debts" subtitle="What you owe and what's owed to you." />

      {/* Net summary */}
      {!loading && (iOwe.length > 0 || owedMe.length > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">I Owe</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{formatKES(totalOwe)}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Owed to Me</p>
            <p className="text-2xl font-bold mt-1 text-primary">{formatKES(totalOwed)}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Net</p>
            <p className={`text-2xl font-bold mt-1 ${net >= 0 ? "text-primary" : "text-destructive"}`}>
              {net >= 0 ? "+" : "−"}{formatKES(Math.abs(net))}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <CardGridSkeleton count={4} className="grid md:grid-cols-2 gap-6" />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* I Owe */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">I Owe</h2>
              <button
                onClick={() => { setForm(emptyForm); setAddDir("owe"); }}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
            {addDir === "owe" && (
              <AddForm form={form} setForm={setForm} onSave={saveDebt} onCancel={() => setAddDir(null)} saving={saving} label="Who do you owe?" />
            )}
            <div className="space-y-2">
              {iOwe.length === 0
                ? <p className="text-sm text-muted-foreground py-4 text-center">None yet</p>
                : iOwe.map(d => renderDebt(d, "owe"))
              }
            </div>
          </div>

          {/* Owed to Me */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Owed to Me</h2>
              <button
                onClick={() => { setForm(emptyForm); setAddDir("owed"); }}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
            {addDir === "owed" && (
              <AddForm form={form} setForm={setForm} onSave={saveDebt} onCancel={() => setAddDir(null)} saving={saving} label="Who owes you?" />
            )}
            <div className="space-y-2">
              {owedMe.length === 0
                ? <p className="text-sm text-muted-foreground py-4 text-center">None yet</p>
                : owedMe.map(d => renderDebt(d, "owed"))
              }
            </div>
          </div>
        </div>
      )}

      {/* Settled */}
      {settled.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowSettled(v => !v)}
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            {showSettled ? "Hide" : "Show"} {settled.length} settled debt{settled.length !== 1 ? "s" : ""}
          </button>
          {showSettled && (
            <div className="mt-3 space-y-2">
              {settled.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-border opacity-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary flex-shrink-0" />
                      <span className="text-sm line-through">{d.party}</span>
                      <span className="text-xs text-muted-foreground">{d.direction === "owe" ? "you owed" : "owed you"}</span>
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5 ml-5 truncate">{d.description}</p>}
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground flex-shrink-0">{formatKES(Number(d.amount))}</span>
                  <button onClick={() => setDeleteId(d.id)} className="p-1 text-muted-foreground hover:text-destructive transition flex-shrink-0">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete debt?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the record and all payment history. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface AddFormProps {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}

const AddForm = ({ form, setForm, onSave, onCancel, saving, label }: AddFormProps) => (
  <div className="bg-secondary/30 rounded-xl p-4 mb-4 space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <label className="block col-span-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <input
          value={form.party}
          onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
          placeholder="Name or company"
          className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Amount (KES)</span>
        <input
          type="number" min={0} step="0.01"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          placeholder="0.00"
          className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Due date (optional)</span>
        <input
          type="date"
          value={form.due_date}
          onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
          className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <label className="block col-span-2">
        <span className="text-xs text-muted-foreground">Notes (optional)</span>
        <input
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="e.g. Borrowed for equipment"
          className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </label>
    </div>
    <div className="flex gap-2">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 bg-primary text-primary-foreground font-semibold py-2 rounded-lg text-sm hover:bg-primary-glow transition disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition"
      >
        <X className="size-4" />
      </button>
    </div>
  </div>
);

export default Debts;
