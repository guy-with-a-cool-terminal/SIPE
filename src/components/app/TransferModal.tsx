import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket } from "@/integrations/supabase/types";
import { X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}

export const TransferModal = ({ open, onClose, onSaved, userId }: Props) => {
  const [from, setFrom] = useState<Bucket>("I");
  const [to, setTo] = useState<Bucket>("S");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setFrom("I");
    setTo("S");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const note = String(fd.get("note") || "") || null;
    const occurred_at = new Date(String(fd.get("date") || new Date().toISOString().slice(0, 10))).toISOString();

    if (from === to) return toast.error("Cannot transfer to the same bucket");
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");

    const fromMeta = BUCKET_META[from];
    const toMeta = BUCKET_META[to];

    setSaving(true);
    const { error } = await supabase.from("transactions").insert([
      {
        user_id: userId,
        type: "expense",
        bucket: from,
        amount,
        category: "Transfer",
        description: note || `Transfer → ${toMeta.name}`,
        occurred_at,
      },
      {
        user_id: userId,
        type: "income",
        bucket: to,
        amount,
        category: "Transfer",
        description: note || `Transfer from ${fromMeta.name}`,
        occurred_at,
        parent_id: null,
      },
    ]);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Transferred ${formatKES(amount)} from ${fromMeta.name} to ${toMeta.name}`);
    handleClose();
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={handleClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-3xl p-8 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Transfer between buckets</h3>
          <button type="button" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Move money from one bucket to another. The source balance decreases and the destination increases.
        </p>

        {/* From / To selectors */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">From</p>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value as Bucket)}
              className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm"
            >
              {ALL_BUCKETS.map(b => (
                <option key={b} value={b} disabled={b === to}>{BUCKET_META[b].name}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="size-5 text-muted-foreground flex-shrink-0 mt-5" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">To</p>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value as Bucket)}
              className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm"
            >
              {ALL_BUCKETS.map(b => (
                <option key={b} value={b} disabled={b === from}>{BUCKET_META[b].name}</option>
              ))}
            </select>
          </div>
        </div>

        {from === to && (
          <p className="text-xs text-destructive mb-4">Source and destination must be different buckets.</p>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Amount (KES)</span>
            <input name="amount" type="number" step="0.01" required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input name="note" placeholder={`Transfer from ${BUCKET_META[from].name} to ${BUCKET_META[to].name}`} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving || from === to}
          className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50"
        >
          {saving ? "Transferring…" : "Transfer"}
        </button>
      </form>
    </div>
  );
};
