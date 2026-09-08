import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Account } from "@/integrations/supabase/types";
import { ResponsiveModal } from "./ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import { dateInputToISO } from "@/lib/dates";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const CATEGORIES = ["Client work", "Retainer", "Product sale", "Consulting", "Refund", "Other"];

export const DepositModal = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) => {
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase.from("accounts").select("*").eq("archived", false).order("name").then(({ data }) => {
      const list: Account[] = data || [];
      setAccounts(list);
      setAccountId(list.find((a) => a.is_default)?.id ?? "");
    });
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const source = String(fd.get("source") || "");
    const category = String(fd.get("category") || "");
    const note = String(fd.get("note") || "");
    const date = String(fd.get("date") || "");
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setSaving(false); return toast.error("Not signed in"); }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/record-deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amount, source, category, note,
        account_id: accountId || undefined,
        occurred_at: date ? dateInputToISO(date) : undefined,
      }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) return toast.error(body.error || "Failed to record deposit");
    toast.success(`Deposited ${amount.toLocaleString("en-KE")} KES — split into your buckets`);
    onSaved?.();
    onClose();
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="Deposit earnings"
      description="Auto-splits into S / I / P / E using your allocation settings."
    >
      <form onSubmit={submit}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Amount (KES)</span>
            <input name="amount" type="number" step="0.01" required autoFocus className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Source</span>
            <input name="source" placeholder="e.g. Client X, Logo design" className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Category</span>
            <select name="category" defaultValue="Client work" className={field}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {accounts.length > 0 && (
            <label className="block">
              <span className="text-sm text-muted-foreground">Account (optional)</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
                <option value="">— none —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input name="note" className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className={field} />
          </label>
        </div>
        <button type="submit" disabled={saving} className={submitButton}>
          {saving ? "Recording…" : "Record deposit"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
