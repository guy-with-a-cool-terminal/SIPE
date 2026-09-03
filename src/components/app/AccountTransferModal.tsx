import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Account } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  accounts: Account[];
}

const today = () => new Date().toISOString().slice(0, 10);

export const AccountTransferModal = ({ open, onClose, onSaved, userId, accounts }: Props) => {
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAmount(""); setFee(""); setNote(""); setDate(today());
    setFrom(accounts[0]?.id ?? "");
    setTo(accounts[1]?.id ?? "");
  }, [open, accounts]);

  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const amt = Number(amount);
    const feeAmt = Number(fee) || 0;
    if (!from || !to) return toast.error("Pick both accounts");
    if (from === to) return toast.error("From and to must be different accounts");
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (feeAmt < 0) return toast.error("Fee cannot be negative");

    setSaving(true);
    const { error } = await supabase.from("account_transfers").insert({
      user_id: userId,
      from_account_id: from,
      to_account_id: to,
      amount: amt,
      fee: feeAmt,
      note: note.trim() || null,
      occurred_at: new Date(date).toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Transferred ${formatKES(amt)}`);
    onSaved();
    onClose();
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass rounded-3xl p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Record transfer</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">Move cash between two accounts — a platform payout to a bank, bank to M-Pesa, etc.</p>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">From</p>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === to}>{a.name}</option>)}
            </select>
          </div>
          <ArrowRight className="size-5 text-muted-foreground flex-shrink-0 mt-5" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">To</p>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === from}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {from === to && from !== "" && (
          <p className="text-xs text-destructive mb-4">From and destination must be different accounts.</p>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Amount (KES)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" required className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Fee (KES)</span>
              <input value={fee} onChange={(e) => setFee(e.target.value)} type="number" step="0.01" placeholder="0.00" className={field} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={field} />
          </label>
        </div>

        <button type="submit" disabled={saving || from === to} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Saving…" : "Record transfer"}
        </button>
      </form>
    </div>
  );
};
