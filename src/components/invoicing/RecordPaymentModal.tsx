import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, type Account } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import { dateInputToISO } from "@/lib/dates";
import {
  PAYMENT_METHOD_LABEL, balanceDue, todayISODate,
  type PaymentMethod, type SalesDocument,
} from "@/lib/invoicing";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: SalesDocument;
  clientName: string;
  onSaved: () => void;
}

/**
 * Money received against an invoice. By default it also goes through
 * record-deposit, so it is split into the S/I/P/E buckets like any income.
 * Untick that when the money is already in SIPE (e.g. it arrived by Paystack
 * or was deposited by hand before the invoice existed).
 */
export const RecordPaymentModal = ({ open, onClose, invoice, clientName, onSaved }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [split, setSplit] = useState(true);
  const due = balanceDue(invoice);

  useEffect(() => {
    if (!open) return;
    setSplit(true);
    supabase.from("accounts").select("*").eq("archived", false).order("name").then(({ data }) => {
      const list: Account[] = data || [];
      setAccounts(list);
      setAccountId(list.find((a) => a.is_default)?.id ?? "");
    });
  }, [open]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const method = String(fd.get("method") || "mpesa") as PaymentMethod;
    const reference = String(fd.get("reference") || "").trim();
    const date = String(fd.get("date") || "");
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (amount > due + 0.01) return toast.error(`That's more than the ${formatKES(due)} balance`);
    const paidAt = date ? dateInputToISO(date) : new Date().toISOString();

    setSaving(true);
    if (split) {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/record-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          amount,
          source: clientName,
          category: "Client work",
          note: `${invoice.number} · ${clientName}`,
          account_id: accountId || undefined,
          occurred_at: paidAt,
          document_id: invoice.id,
          method,
          reference,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) return toast.error(body.error || "Couldn't record the payment");
    } else {
      const { error } = await supabase.from("document_payments").insert({
        document_id: invoice.id,
        user_id: user!.id,
        amount,
        paid_at: paidAt,
        method,
        reference: reference || null,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
    }
    toast.success(amount >= due - 0.01 ? `${invoice.number} paid in full` : `Payment recorded · ${formatKES(due - amount)} left`);
    onSaved();
    onClose();
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} title="Record payment" description={`${invoice.number} · balance ${formatKES(due)}`}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted-foreground">Amount (KES)</span>
          <input name="amount" type="number" step="0.01" min={0} defaultValue={due || ""} required autoFocus className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted-foreground">Method</span>
            <select name="method" defaultValue="mpesa" className={field}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date received</span>
            <input name="date" type="date" defaultValue={todayISODate()} className={field} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">Reference</span>
          <input name="reference" placeholder="M-Pesa code or bank ref" className={`${field} uppercase`} />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
          <span>
            Record as income and split into my buckets
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Untick if this money is already in SIPE, so it isn't counted twice.
            </span>
          </span>
        </label>

        {split && accounts.length > 0 && (
          <label className="block">
            <span className="text-sm text-muted-foreground">Into account</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        <button type="submit" disabled={saving} className={submitButton}>
          {saving ? "Recording…" : "Record payment"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
