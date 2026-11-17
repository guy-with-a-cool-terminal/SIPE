import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, FilePen, Pencil, ReceiptText, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { StatusBadge } from "@/components/invoicing/StatusBadge";
import { createDraft, useBusinessProfile } from "@/hooks/useInvoicing";
import { cn } from "@/lib/utils";
import { displayStatus, formatDocDate, type Client, type DocumentKind } from "@/lib/invoicing";
import { clientName, type ClientStats, type PriorityDoc } from "@/lib/clientPriority";
import { TierBadge } from "./TierBadge";

interface Props {
  client: Client | null;
  stats: ClientStats | undefined;
  docs: PriorityDoc[];
  onClose: () => void;
  onEdit: (c: Client) => void;
}

/** One client at a glance: what they're worth, how they pay, and their documents. */
export const ClientDetail = ({ client, stats, docs, onClose, onEdit }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useBusinessProfile();
  const [busy, setBusy] = useState(false);

  const mine = client
    ? docs.filter((d) => d.client_id === client.id).sort((a, b) => b.issue_date.localeCompare(a.issue_date))
    : [];

  const update = async (patch: Partial<Client>, ok: string) => {
    if (!client) return;
    setBusy(true);
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    setBusy(false);
    if (error) {
      return toast.error(/key_client/.test(error.message) ? "Run the key clients migration first (20261117000000_key_clients.sql)" : error.message);
    }
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    toast.success(ok);
  };

  const newDoc = async (kind: DocumentKind) => {
    if (!user || !client) return;
    setBusy(true);
    try {
      const id = await createDraft(kind, user.id, profile ?? null, { client_id: client.id });
      navigate(`/${kind === "invoice" ? "invoices" : "quotes"}/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const pays =
    !stats || stats.avgDaysLate === null ? "No paid invoices yet"
    : stats.avgDaysLate <= 0 ? `On time (${stats.paidOnTime} of ${stats.paidInvoices})`
    : `${stats.avgDaysLate} ${stats.avgDaysLate === 1 ? "day" : "days"} late on average`;

  const figures = stats ? [
    { label: "Paid you, last 12 months", value: formatKES(stats.earned12m), sub: stats.share12m > 0 ? `${Math.round(stats.share12m * 100)}% of your client income` : undefined },
    { label: "Owed now", value: formatKES(stats.owed), sub: stats.overdue > 0 ? `${formatKES(stats.overdue)} overdue` : undefined, warn: stats.overdue > 0 },
    { label: "Quoted, not yet invoiced", value: formatKES(stats.pipeline) },
    { label: "Pays", value: pays },
  ] : [];

  const actionBtn = "flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40 disabled:opacity-50";

  return (
    <ResponsiveModal
      open={!!client}
      onClose={onClose}
      size="lg"
      title={client ? clientName(client) : ""}
      description={client && client.company && client.company !== client.name ? client.name : undefined}
    >
      {client && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {stats && <TierBadge tier={stats.tier} />}
            <button
              onClick={() => update({ key_client: !client.key_client }, client.key_client ? "No longer a key client" : "Marked as a key client")}
              disabled={busy}
              aria-pressed={!!client.key_client}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                client.key_client ? "border-warning/40 bg-warning/10 text-warning" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Star className={cn("size-4", client.key_client && "fill-current")} /> {client.key_client ? "Key client" : "Mark as key client"}
            </button>
          </div>

          {stats && stats.reasons.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {stats.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border py-4">
            {figures.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className={cn("mt-0.5 font-semibold tabular-nums", f.warn && "text-destructive")}>{f.value}</dd>
                {f.sub && <dd className="text-xs text-muted-foreground">{f.sub}</dd>}
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => newDoc("invoice")} disabled={busy} className={actionBtn}><ReceiptText className="size-4" /> New invoice</button>
            <button onClick={() => newDoc("quote")} disabled={busy} className={actionBtn}><FilePen className="size-4" /> New quote</button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Quotes and invoices</h3>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">None finalised yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {mine.slice(0, 12).map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/${d.kind === "invoice" ? "invoices" : "quotes"}/${d.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-secondary/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.number}{d.title ? ` · ${d.title}` : ""}</span>
                        <span className="block text-xs text-muted-foreground">{formatDocDate(d.issue_date)}</span>
                      </span>
                      <span className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-semibold tabular-nums">{formatKES(Number(d.total))}</span>
                        <StatusBadge status={displayStatus(d)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-1 border-t border-border pt-3">
            <button onClick={() => onEdit(client)} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition hover:text-foreground">
              <Pencil className="size-4" /> Edit details
            </button>
            <button
              onClick={() => update({ archived: !client.archived }, client.archived ? "Client restored" : "Client archived").then(onClose)}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              {client.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {client.archived ? "Restore" : "Archive"}
            </button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
};
