import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Account } from "@/integrations/supabase/types";
import { ResponsiveModal } from "./ResponsiveModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  accounts: Account[];
  /** account_id -> current computed balance */
  balances: Record<string, number>;
  initialAccountId?: string;
}

export const AdjustBalanceModal = ({ open, onClose, onSaved, userId, accounts, balances, initialAccountId }: Props) => {
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setActual("");
    setReason("");
    setAccountId(initialAccountId || accounts[0]?.id || "");
  }, [open, initialAccountId, accounts]);

  if (!open) return null;

  const current = accountId in balances ? balances[accountId] : 0;
  const actualNum = actual === "" ? null : Number(actual);
  const delta = actualNum === null ? 0 : Number((actualNum - current).toFixed(2));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!accountId) return toast.error("Pick an account");
    if (actualNum === null || Number.isNaN(actualNum)) return toast.error("Enter the actual balance");
    if (delta === 0) return toast.error("Balance already matches — nothing to adjust");

    setSaving(true);
    const { error } = await supabase.from("account_adjustments").insert({
      user_id: userId,
      account_id: accountId,
      amount: delta,
      reason: reason.trim() || null,
      occurred_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Adjusted by ${delta > 0 ? "+" : "−"}${formatKES(Math.abs(delta))}`);
    onSaved();
    onClose();
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Adjust balance"
      description="Tell SIPE the real balance. It records a signed correction so the account matches reality."
    >
      <form onSubmit={submit}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Account</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <div className="flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Currently tracked</span>
            <span className="font-semibold tabular-nums">{formatKES(current)}</span>
          </div>

          <label className="block">
            <span className="text-sm text-muted-foreground">Actual balance is (KES)</span>
            <input value={actual} onChange={(e) => setActual(e.target.value)} type="number" step="0.01" required autoFocus className={field} />
          </label>

          {actualNum !== null && !Number.isNaN(actualNum) && (
            <p className={`text-xs ${delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-primary" : "text-destructive"}`}>
              {delta === 0 ? "No change" : `Adjustment: ${delta > 0 ? "+" : "−"}${formatKES(Math.abs(delta))}`}
            </p>
          )}

          <label className="block">
            <span className="text-sm text-muted-foreground">Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. bank fees, missed cash expense" className={field} />
          </label>
        </div>

        <button type="submit" disabled={saving} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Saving…" : "Record adjustment"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
