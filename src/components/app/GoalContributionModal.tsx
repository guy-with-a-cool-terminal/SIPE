import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Goal } from "@/integrations/supabase/types";
import { goalIcon } from "@/lib/goalIcons";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  goal: Goal | null;
  /** current contributed amount, for context */
  current?: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export const GoalContributionModal = ({ open, onClose, onSaved, userId, goal, current }: Props) => {
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAmount("");
    setNote("");
    setDate(today());
  }, [open]);

  if (!open || !goal) return null;

  const amt = Number(amount);
  const Icon = goalIcon(goal.icon);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!amt || Number.isNaN(amt)) return toast.error("Enter an amount (negative to correct a mistake)");

    setSaving(true);
    const { error } = await supabase.from("goal_contributions").insert({
      goal_id: goal.id,
      user_id: userId,
      amount: amt,
      note: note.trim() || null,
      occurred_at: new Date(date).toISOString(),
      auto: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(amt >= 0 ? `Added ${formatKES(amt)}` : `Recorded −${formatKES(Math.abs(amt))}`);
    onSaved();
    onClose();
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass rounded-3xl p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Add contribution</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
          <Icon className="size-4 text-foreground shrink-0" />
          <span className="font-medium text-foreground">{goal.name}</span>
          {current != null && <> · {formatKES(current)} of {formatKES(Number(goal.target_amount))}</>}
        </p>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Amount (KES)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" autoFocus placeholder="0.00" className={field} />
            <span className="text-xs text-muted-foreground mt-1 block">Use a negative amount to undo an over-contribution.</span>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bonus from Acme project" className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={field} />
          </label>
        </div>

        <button type="submit" disabled={saving} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Saving…" : "Record contribution"}
        </button>
      </form>
    </div>
  );
};
