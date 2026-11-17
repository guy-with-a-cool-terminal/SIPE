import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/invoicing";
import type { AttentionItem, AttentionKind } from "@/lib/clientPriority";
import { ReminderModal } from "./ReminderModal";

const KIND: Record<AttentionKind, { label: string; tone: string; action: string }> = {
  overdue: { label: "Overdue", tone: "text-destructive", action: "Remind" },
  invoice_accepted: { label: "Not invoiced", tone: "text-warning", action: "Create invoice" },
  due_soon: { label: "Due soon", tone: "text-foreground", action: "Remind" },
  quote_expiring: { label: "Quote expiring", tone: "text-foreground", action: "Follow up" },
  check_in: { label: "Gone quiet", tone: "text-muted-foreground", action: "Check in" },
};

const SHOWN = 5;

export const NeedsAttention = ({ items, clients }: { items: AttentionItem[]; clients: Client[] }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [all, setAll] = useState(false);
  const [reminding, setReminding] = useState<AttentionItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = new Map(clients.map((c) => [c.id, c]));

  if (items.length === 0) {
    return (
      <section className="glass mb-6 rounded-2xl p-5">
        <h2 className="text-base font-semibold">Needs attention</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nothing right now. Overdue invoices, quotes about to expire and quiet top clients show up here.</p>
      </section>
    );
  }

  const invoiceQuote = async (item: AttentionItem) => {
    if (!item.doc) return;
    setBusy(item.doc.id);
    const { data, error } = await supabase.rpc("convert_quote_to_invoice", { p_id: item.doc.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries();
    toast.success("Invoice draft created from the quote");
    navigate(`/invoices/${data}`);
  };

  const docPath = (i: AttentionItem) => (i.doc ? `/${i.doc.kind === "invoice" ? "invoices" : "quotes"}/${i.doc.id}` : null);
  const visible = all ? items : items.slice(0, SHOWN);

  return (
    <section className="glass mb-6 overflow-hidden rounded-2xl">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="text-base font-semibold">Needs attention</h2>
        <span className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? "thing" : "things"}</span>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((i) => {
          const k = KIND[i.kind];
          const path = docPath(i);
          const key = `${i.kind}-${i.doc?.id ?? i.clientId}`;
          return (
            <li key={key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-medium", k.tone)}>{k.label}</p>
                {path ? (
                  <Link to={path} className="block font-medium leading-snug hover:text-primary sm:truncate">{i.title}</Link>
                ) : (
                  <p className="font-medium leading-snug sm:truncate">{i.title}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground sm:truncate">{i.detail}</p>
              </div>
              <button
                onClick={() => (i.kind === "invoice_accepted" ? invoiceQuote(i) : setReminding(i))}
                disabled={busy === i.doc?.id}
                className={cn(
                  "flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
                  i.kind === "overdue" || i.kind === "invoice_accepted"
                    ? "bg-primary text-primary-foreground hover:bg-primary-glow"
                    : "border border-border hover:bg-secondary/40",
                )}
              >
                {busy === i.doc?.id ? "Creating…" : k.action}
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > SHOWN && (
        <button onClick={() => setAll((v) => !v)} className="w-full border-t border-border px-5 py-3 text-sm font-medium text-primary transition hover:bg-secondary/30">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
      <ReminderModal item={reminding} client={reminding ? byId.get(reminding.clientId) : undefined} onClose={() => setReminding(null)} />
    </section>
  );
};
