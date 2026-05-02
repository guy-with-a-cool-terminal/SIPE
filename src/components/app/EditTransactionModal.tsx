import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { X, Info } from "lucide-react";
import { toast } from "sonner";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];

const CATEGORIES = ["Client work", "Retainer", "Product sale", "Consulting", "Refund", "Other"];

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EditTransactionModal = ({ transaction, onClose, onSaved }: Props) => {
  const [saving, setSaving] = useState(false);

  if (!transaction) return null;

  const isDeposit = transaction.type === "income";
  const isSplitParent = transaction.type === "expense" && transaction.bucket === null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const occurred_at = new Date(String(fd.get("date") || "")).toISOString();

    let payload: Record<string, unknown>;

    if (isDeposit) {
      payload = {
        description: String(fd.get("description") || "") || null,
        source: String(fd.get("source") || "") || null,
        category: String(fd.get("category") || "") || null,
        occurred_at,
      };
    } else if (isSplitParent) {
      const amount = Number(fd.get("amount"));
      if (!amount || amount <= 0) return toast.error("Enter a valid amount");
      payload = {
        amount,
        description: String(fd.get("description") || "") || null,
        occurred_at,
      };
    } else {
      const amount = Number(fd.get("amount"));
      if (!amount || amount <= 0) return toast.error("Enter a valid amount");
      payload = {
        amount,
        bucket: fd.get("bucket") as Bucket,
        category: String(fd.get("category") || "") || null,
        description: String(fd.get("description") || "") || null,
        occurred_at,
      };
    }

    setSaving(true);
    const { error } = await supabase.from("transactions").update(payload).eq("id", transaction.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transaction updated");
    onSaved();
    onClose();
  };

  const dateDefault = transaction.occurred_at.slice(0, 10);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-3xl p-8 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Edit {isDeposit ? "deposit" : "expense"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          {isDeposit ? (
            <>
              {/* Deposit: amount read-only */}
              <div>
                <p className="text-sm text-muted-foreground mb-1.5">Amount (KES)</p>
                <div className="flex items-center gap-2 p-3 bg-secondary/40 rounded-xl">
                  <span className="font-semibold text-primary">{formatKES(Number(transaction.amount))}</span>
                  <span className="text-xs text-muted-foreground ml-auto">read-only</span>
                </div>
                <div className="flex items-start gap-1.5 mt-1.5">
                  <Info className="size-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">To correct the amount, delete this deposit and add a new one — re-splitting is required.</p>
                </div>
              </div>
              <label className="block">
                <span className="text-sm text-muted-foreground">Description</span>
                <input name="description" defaultValue={transaction.description || ""} placeholder="Optional" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Source</span>
                <input name="source" defaultValue={transaction.source || ""} placeholder="e.g. Client X — Logo design" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Category</span>
                <select name="category" defaultValue={transaction.category || ""} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5">
                  <option value="">— Select —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Date</span>
                <input name="date" type="date" defaultValue={dateDefault} required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
              </label>
            </>
          ) : isSplitParent ? (
            <>
              {/* Split parent: show info note, allow editing total + meta */}
              <div className="flex items-start gap-1.5 p-3 bg-secondary/40 rounded-xl">
                <Info className="size-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">Split expense — you can edit the total and description here. To rebalance individual buckets, delete and re-enter.</p>
              </div>
              <label className="block">
                <span className="text-sm text-muted-foreground">Total amount (KES)</span>
                <input name="amount" type="number" step="0.01" required defaultValue={transaction.amount} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Description</span>
                <input name="description" defaultValue={transaction.description || ""} placeholder="Optional" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Date</span>
                <input name="date" type="date" defaultValue={dateDefault} required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
              </label>
            </>
          ) : (
            <>
              {/* Regular expense: full edit */}
              <label className="block">
                <span className="text-sm text-muted-foreground">Amount (KES)</span>
                <input name="amount" type="number" step="0.01" required defaultValue={transaction.amount} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Bucket</span>
                <select name="bucket" required defaultValue={transaction.bucket || "E"} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5">
                  {ALL_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_META[b].name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Category</span>
                <input name="category" defaultValue={transaction.category || ""} placeholder="e.g. Software, Tax, Coffee" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Description</span>
                <input name="description" defaultValue={transaction.description || ""} placeholder="Optional" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Date</span>
                <input name="date" type="date" defaultValue={dateDefault} required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
              </label>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
};
