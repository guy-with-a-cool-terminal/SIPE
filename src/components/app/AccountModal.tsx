import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KIND_META } from "@/lib/accounts";
import type { Account, AccountKind } from "@/integrations/supabase/types";
import { ResponsiveModal } from "./ResponsiveModal";
import { SWATCHES } from "@/lib/swatches";
import { dateInputToISO } from "@/lib/dates";

const KINDS = Object.keys(KIND_META) as AccountKind[];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  account?: Account | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const AccountModal = ({ open, onClose, onSaved, userId, account }: Props) => {
  const editing = !!account;
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [institution, setInstitution] = useState("");
  const [providerSlug, setProviderSlug] = useState("");
  const [routeKind, setRouteKind] = useState<"" | "ops" | "costs">("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceAt, setOpeningBalanceAt] = useState(today());
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setName(account?.name ?? "");
    setKind(account?.kind ?? "bank");
    setInstitution(account?.institution ?? "");
    setProviderSlug(account?.provider_slug ?? "");
    setRouteKind((account?.route_kind as "ops" | "costs" | null) ?? "");
    setOpeningBalance(account ? String(account.opening_balance) : "");
    setOpeningBalanceAt(account?.opening_balance_at?.slice(0, 10) ?? today());
    setIsDefault(account?.is_default ?? false);
    setColor(account?.color ?? "");
    setNotes(account?.notes ?? "");
  }, [open, account]);

  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return toast.error("Enter an account name");

    const payload = {
      user_id: userId,
      name: name.trim(),
      kind,
      institution: institution.trim() || null,
      provider_slug: providerSlug.trim() || null,
      route_kind: routeKind || null,
      opening_balance: Number(openingBalance) || 0,
      opening_balance_at: dateInputToISO(openingBalanceAt),
      is_default: isDefault,
      color: color || null,
      notes: notes.trim() || null,
    };

    setSaving(true);

    // One-default-per-user is enforced server-side by the `accounts_single_default`
    // trigger (20260903000300) — no client-side pre-clear needed.
    const { error } = account
      ? await supabase.from("accounts").update(payload).eq("id", account.id)
      : await supabase.from("accounts").insert(payload);

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Account updated" : "Account created");
    onSaved();
    onClose();
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <ResponsiveModal open={open} onClose={onClose} title={editing ? "Edit account" : "New account"}>
      <form onSubmit={submit}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. I&M Bank, M-Pesa, Lexinon" className={field} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Kind</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className={field}>
                {KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Institution</span>
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional" className={field} />
            </label>
          </div>

          {kind === "platform" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-muted-foreground">Provider slug</span>
                <input value={providerSlug} onChange={(e) => setProviderSlug(e.target.value)} placeholder="lexinon, toefl…" className={field} />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Route</span>
                <select value={routeKind} onChange={(e) => setRouteKind(e.target.value as "" | "ops" | "costs")} className={field}>
                  <option value="">— none —</option>
                  <option value="ops">ops</option>
                  <option value="costs">costs</option>
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Opening balance (KES)</span>
              <input value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} type="number" step="0.01" placeholder="0.00" className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">As of</span>
              <input value={openingBalanceAt} onChange={(e) => setOpeningBalanceAt(e.target.value)} type="date" className={field} />
            </label>
          </div>

          <div>
            <span className="text-sm text-muted-foreground">Colour</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <button type="button" onClick={() => setColor("")} className={`size-7 rounded-full border grid place-items-center text-xs ${color === "" ? "border-primary" : "border-border"}`} title="None">–</button>
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{ backgroundColor: c }}
                  className={`size-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setIsDefault((v) => !v)} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${isDefault ? "bg-primary" : "bg-secondary"}`}>
              <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${isDefault ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm text-muted-foreground">Default account — receives Paystack / webhook income</span>
          </label>

          <label className="block">
            <span className="text-sm text-muted-foreground">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
          </label>
        </div>

        <button type="submit" disabled={saving} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
          {saving ? "Saving…" : editing ? "Save changes" : "Create account"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
