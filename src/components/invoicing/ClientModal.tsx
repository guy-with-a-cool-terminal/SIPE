import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import type { Client } from "@/lib/invoicing";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit this client; omit to create one. */
  client?: Client | null;
  onSaved?: (client: Client) => void;
}

export const ClientModal = ({ open, onClose, client, onSaved }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const name = val("name");
    if (!name) return toast.error("Enter the client's name");
    const row = {
      name,
      company: val("company"),
      email: val("email"),
      phone: val("phone"),
      address: val("address"),
      kra_pin: val("kra_pin")?.toUpperCase() ?? null,
      notes: val("notes"),
    };
    setSaving(true);
    const res = client
      ? await supabase.from("clients").update(row).eq("id", client.id).select().single()
      : await supabase.from("clients").insert({ ...row, user_id: user!.id }).select().single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    toast.success(client ? "Client updated" : "Client added");
    onSaved?.(res.data as Client);
    onClose();
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} title={client ? "Edit client" : "New client"} size="lg">
      <form onSubmit={submit} className="space-y-4" key={client?.id ?? "new"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-muted-foreground">Contact name <span className="text-primary">*</span></span>
            <input name="name" className={field} defaultValue={client?.name ?? ""} autoFocus />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Company</span>
            <input name="company" className={field} defaultValue={client?.company ?? ""} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Email</span>
            <input name="email" type="email" className={field} defaultValue={client?.email ?? ""} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Phone</span>
            <input name="phone" type="tel" className={field} defaultValue={client?.phone ?? ""} />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">KRA PIN</span>
            <input name="kra_pin" className={`${field} uppercase`} defaultValue={client?.kra_pin ?? ""} />
            <span className="mt-1 block text-xs text-muted-foreground">Companies usually need it on the invoice</span>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Address</span>
            <textarea name="address" rows={2} className={`${field} resize-y`} defaultValue={client?.address ?? ""} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">Private notes</span>
          <textarea name="notes" rows={2} className={`${field} resize-y`} defaultValue={client?.notes ?? ""} placeholder="Never shown on documents" />
        </label>
        <button type="submit" disabled={saving} className={submitButton}>
          {saving ? "Saving…" : client ? "Save changes" : "Add client"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
