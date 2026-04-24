import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const CATEGORIES = ["Client work", "Retainer", "Product sale", "Consulting", "Refund", "Other"];

export const DepositModal = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) => {
  const [saving, setSaving] = useState(false);
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
        occurred_at: date ? new Date(date).toISOString() : undefined,
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur grid place-items-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass rounded-3xl p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Deposit earnings</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Auto-splits into S / I / P / E using your allocation settings.</p>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Amount (KES)</span>
            <input name="amount" type="number" step="0.01" required autoFocus className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Source</span>
            <input name="source" placeholder="e.g. Client X — Logo design" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Category</span>
            <select name="category" defaultValue="Client work" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input name="note" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5" />
          </label>
        </div>
        <button type="submit" disabled={saving} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Recording…" : "Record deposit"}
        </button>
      </form>
    </div>
  );
};
