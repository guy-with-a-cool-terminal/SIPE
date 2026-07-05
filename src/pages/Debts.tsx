import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Debt } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Direction = "owe" | "owed";

const emptyForm = { party: "", description: "", amount: "", due_date: "" };

const Debts = () => {
  const { user } = useAuth();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettled, setShowSettled] = useState(false);
  const [addDir, setAddDir] = useState<Direction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDebts(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const openAdd = (dir: Direction) => {
    setForm(emptyForm);
    setAddDir(dir);
  };

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
    load();
  };

  const settle = async () => {
    if (!settleId) return;
    const { error } = await supabase
      .from("debts")
      .update({ settled: true, settled_at: new Date().toISOString() })
      .eq("id", settleId);
    if (error) return toast.error(error.message);
    toast.success("Marked as settled");
    setSettleId(null);
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

  const active = debts.filter(d => !d.settled);
  const settled = debts.filter(d => d.settled);
  const iOwe  = active.filter(d => d.direction === "owe");
  const owedMe = active.filter(d => d.direction === "owed");
  const totalOwe  = iOwe.reduce((s, d) => s + Number(d.amount), 0);
  const totalOwed = owedMe.reduce((s, d) => s + Number(d.amount), 0);
  const net = totalOwed - totalOwe;

  const formatDue = (due: string | null) => {
    if (!due) return null;
    const d = new Date(due);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = d < today;
    const label = d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    return { label, overdue };
  };

  const DebtList = ({ items, dir }: { items: Debt[]; dir: Direction }) => (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">None yet</p>
      ) : (
        items.map(d => {
          const due = formatDue(d.due_date);
          return (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{d.party}</span>
                  {due && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${due.overdue ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                      {due.overdue ? "overdue" : ""} {due.label}
                    </span>
                  )}
                </div>
                {d.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</p>}
              </div>
              <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${dir === "owed" ? "text-primary" : ""}`}>
                {dir === "owed" ? "+" : "−"}{formatKES(Number(d.amount))}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setSettleId(d.id)}
                  className="p-1 rounded-md text-muted-foreground hover:text-primary transition"
                  title="Mark settled"
                >
                  <Check className="size-4" />
                </button>
                <button
                  onClick={() => setDeleteId(d.id)}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive transition"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Debts</h1>
          <p className="text-muted-foreground mt-1">What you owe and what's owed to you.</p>
        </div>
      </div>

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
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* I Owe */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">I Owe</h2>
              <button
                onClick={() => openAdd("owe")}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
            {addDir === "owe" && (
              <AddForm
                form={form}
                setForm={setForm}
                onSave={saveDebt}
                onCancel={() => setAddDir(null)}
                saving={saving}
                label="Who do you owe?"
              />
            )}
            <DebtList items={iOwe} dir="owe" />
          </div>

          {/* Owed to Me */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Owed to Me</h2>
              <button
                onClick={() => openAdd("owed")}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
            {addDir === "owed" && (
              <AddForm
                form={form}
                setForm={setForm}
                onSave={saveDebt}
                onCancel={() => setAddDir(null)}
                saving={saving}
                label="Who owes you?"
              />
            )}
            <DebtList items={owedMe} dir="owed" />
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
                      <span className="text-xs text-muted-foreground">
                        {d.direction === "owe" ? "you owed" : "owed you"}
                      </span>
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5 ml-5 truncate">{d.description}</p>}
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground flex-shrink-0">
                    {formatKES(Number(d.amount))}
                  </span>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    className="p-1 text-muted-foreground hover:text-destructive transition flex-shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settle confirm */}
      <AlertDialog open={!!settleId} onOpenChange={open => { if (!open) setSettleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as settled?</AlertDialogTitle>
            <AlertDialogDescription>This marks the debt as paid/received. You can still view it in the settled section.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={settle}>Settle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete debt?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the record. This cannot be undone.</AlertDialogDescription>
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
