import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type BucketBalance } from "@/integrations/supabase/types";
import { Plus, X, Minus, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];

interface SplitRow {
  bucket: Bucket;
  amount: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}

export const AddExpenseModal = ({ open, onClose, onSaved, userId }: Props) => {
  const [splitMode, setSplitMode] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { bucket: "E", amount: "" },
    { bucket: "P", amount: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Partial<Record<Bucket, number>>>({});
  const [singleBucket, setSingleBucket] = useState<Bucket>("E");

  useEffect(() => {
    if (!open) return;
    supabase
      .from("bucket_balances")
      .select("bucket,balance")
      .eq("user_id", userId)
      .then(({ data }) => {
        const map: Partial<Record<Bucket, number>> = {};
        (data as Pick<BucketBalance, "bucket" | "balance">[] | null || []).forEach(r => {
          map[r.bucket as Bucket] = Number(r.balance);
        });
        setBalances(map);
      });
  }, [open, userId]);

  if (!open) return null;

  const splitSum = splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const total = Number(totalAmount) || 0;
  const splitValid = total > 0 && Math.abs(splitSum - total) < 0.01;

  const autoSplit = () => {
    if (total <= 0) return toast.error("Enter a total amount first");
    const positive = ALL_BUCKETS.filter(b => (balances[b] ?? 0) > 0);
    const candidates = positive.length > 0 ? positive : ALL_BUCKETS;
    const totalBal = candidates.reduce((s, b) => s + Math.max(0, balances[b] ?? 0), 0);
    let distributed = 0;
    const newRows: SplitRow[] = candidates.map((b, i) => {
      if (i === candidates.length - 1) {
        return { bucket: b, amount: String(Number((total - distributed).toFixed(2))) };
      }
      const share = totalBal > 0
        ? Number((total * (balances[b] ?? 0) / totalBal).toFixed(2))
        : Number((total / candidates.length).toFixed(2));
      distributed += share;
      return { bucket: b, amount: String(share) };
    });
    setSplitRows(newRows);
    toast.success("Split suggested based on bucket balances");
  };

  const handleClose = () => {
    setSplitMode(false);
    setTotalAmount("");
    setSplitRows([{ bucket: "E", amount: "" }, { bucket: "P", amount: "" }]);
    setSingleBucket("E");
    onClose();
  };

  const updateSplitRow = (i: number, field: keyof SplitRow, value: string) => {
    setSplitRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const removeSplitRow = (i: number) => {
    setSplitRows(rows => rows.filter((_, idx) => idx !== i));
  };

  const addSplitRow = () => {
    setSplitRows(rows => [...rows, { bucket: "E", amount: "" }]);
  };

  const addExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const fd = new FormData(e.currentTarget);
    const category = String(fd.get("category") || "") || null;
    const description = String(fd.get("description") || "") || null;
    const occurred_at = new Date(String(fd.get("date") || new Date().toISOString().slice(0, 10))).toISOString();

    if (splitMode) {
      if (total <= 0) return toast.error("Enter a valid total amount");
      if (!splitValid) return toast.error(`Split amounts must equal the total (${formatKES(total)})`);
      setSaving(true);
      const { data: parent, error: parentErr } = await supabase
        .from("transactions")
        .insert({ user_id: userId, type: "expense", bucket: null, amount: total, category, description, occurred_at })
        .select()
        .single();
      if (parentErr || !parent) { setSaving(false); return toast.error(parentErr?.message || "Failed to create expense"); }
      const children = splitRows
        .filter(r => Number(r.amount) > 0)
        .map(r => ({
          user_id: userId, type: "expense" as const, bucket: r.bucket as Bucket,
          amount: Number(r.amount), category, description, occurred_at,
          parent_id: parent.id,
        }));
      const { error: childErr } = await supabase.from("transactions").insert(children);
      setSaving(false);
      if (childErr) return toast.error(childErr.message);
    } else {
      const amount = Number(fd.get("amount"));
      const bucket = fd.get("bucket") as Bucket;
      if (!amount || amount <= 0) return toast.error("Enter a valid amount");
      setSaving(true);
      const { error } = await supabase.from("transactions").insert({
        user_id: userId, type: "expense", bucket, amount, category, description, occurred_at,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
    }

    toast.success("Expense added");
    handleClose();
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={handleClose}>
      <form
        onSubmit={addExpense}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-3xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Add expense</h3>
          <button type="button" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Split mode toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setSplitMode(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${splitMode ? "bg-primary" : "bg-secondary"}`}
            >
              <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${splitMode ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm text-muted-foreground">Split across multiple buckets</span>
          </label>

          {splitMode ? (
            <>
              {/* Total amount */}
              <label className="block">
                <span className="text-sm text-muted-foreground">Total amount (KES)</span>
                <input
                  type="number" step="0.01" required value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary"
                />
              </label>

              {/* Split rows */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">Bucket split</span>
                  <button
                    type="button"
                    onClick={autoSplit}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    <Sparkles className="size-3.5" /> Auto-split by balance
                  </button>
                </div>
                <div className="space-y-2">
                  {splitRows.map((row, i) => {
                    const avail = balances[row.bucket] ?? 0;
                    const rowAmt = Number(row.amount) || 0;
                    const wouldOverdraw = rowAmt > 0 && rowAmt > avail;
                    return (
                      <div key={i}>
                        <div className="flex gap-2 items-center">
                          <select
                            value={row.bucket}
                            onChange={(e) => updateSplitRow(i, "bucket", e.target.value)}
                            className="bg-input border border-border rounded-xl px-3 py-2 text-sm flex-shrink-0"
                          >
                            {ALL_BUCKETS.map(b => (
                              <option key={b} value={b}>
                                {BUCKET_META[b].name} ({formatKES(balances[b] ?? 0)})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number" step="0.01" placeholder="Amount"
                            value={row.amount}
                            onChange={(e) => updateSplitRow(i, "amount", e.target.value)}
                            className={`flex-1 bg-input border rounded-xl px-3 py-2 text-sm focus:outline-none ${wouldOverdraw ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"}`}
                          />
                          {wouldOverdraw && <AlertTriangle className="size-4 text-destructive flex-shrink-0" />}
                          {splitRows.length > 2 && !wouldOverdraw && (
                            <button type="button" onClick={() => removeSplitRow(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                              <Minus className="size-4" />
                            </button>
                          )}
                          {splitRows.length > 2 && wouldOverdraw && (
                            <button type="button" onClick={() => removeSplitRow(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                              <Minus className="size-4" />
                            </button>
                          )}
                        </div>
                        {wouldOverdraw && (
                          <p className="text-xs text-destructive mt-0.5 ml-1">
                            {formatKES(rowAmt - avail)} over {BUCKET_META[row.bucket].name} balance
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addSplitRow}
                  className="mt-2 text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <Plus className="size-3.5" /> Add bucket
                </button>
                {/* Validation indicator */}
                {total > 0 && (
                  <p className={`text-xs mt-2 ${splitValid ? "text-green-500" : "text-destructive"}`}>
                    Split total: {formatKES(splitSum)} of {formatKES(total)}
                    {splitValid ? " ✓" : ` (${formatKES(Math.abs(total - splitSum))} remaining)`}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-sm text-muted-foreground">Amount (KES)</span>
                <input
                  name="amount" type="number" step="0.01" required
                  className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Bucket</span>
                <select
                  name="bucket" required value={singleBucket}
                  onChange={(e) => setSingleBucket(e.target.value as Bucket)}
                  className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5"
                >
                  {ALL_BUCKETS.map(b => (
                    <option key={b} value={b}>
                      {BUCKET_META[b].name} — {formatKES(balances[b] ?? 0)} available
                    </option>
                  ))}
                </select>
                {(balances[singleBucket] ?? 0) <= 0 && (
                  <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                    <AlertTriangle className="size-3.5" />
                    {BUCKET_META[singleBucket].name} is empty or negative. Consider switching buckets or using split mode.
                  </p>
                )}
              </label>
            </>
          )}

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

        <button
          type="submit"
          disabled={saving || (splitMode && !splitValid && total > 0)}
          className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add expense"}
        </button>
      </form>
    </div>
  );
};
