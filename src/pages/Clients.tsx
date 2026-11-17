import { useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { formatKES } from "@/integrations/supabase/types";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/Skeletons";
import { DataList, type Column } from "@/components/app/DataList";
import { ClientModal } from "@/components/invoicing/ClientModal";
import { NeedsAttention } from "@/components/clients/NeedsAttention";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { TierBadge } from "@/components/clients/TierBadge";
import { useClientPriority } from "@/hooks/useClientPriority";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/invoicing";
import { clientName, compareByPriority, type ClientStats } from "@/lib/clientPriority";

type Sort = "priority" | "owed" | "name";
const SORTS: { key: Sort; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "owed", label: "Owed" },
  { key: "name", label: "A to Z" },
];

const EMPTY_STATS: ClientStats = {
  clientId: "", earned12m: 0, earnedAll: 0, share12m: 0, owed: 0, overdue: 0, maxDaysOverdue: 0, pipeline: 0,
  paidInvoices: 0, paidOnTime: 0, avgDaysLate: null, lastActivity: null, daysQuiet: null, tier: "new", key: false, reasons: [],
};

const paysLabel = (s: ClientStats) =>
  s.avgDaysLate === null ? "–" : s.avgDaysLate <= 0 ? "On time" : `${s.avgDaysLate} ${s.avgDaysLate === 1 ? "day" : "days"} late`;

const quietLabel = (s: ClientStats) =>
  s.daysQuiet === null ? "–" : s.daysQuiet === 0 ? "Today" : s.daysQuiet < 31 ? `${s.daysQuiet}d ago` : `${Math.round(s.daysQuiet / 30)}mo ago`;

const Clients = () => {
  usePageTitle("Clients");
  const { clients, stats, attention, concentrated, docs, isLoading, error } = useClientPriority();
  const [sort, setSort] = useState<Sort>("priority");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const s = (id: string) => stats?.get(id) ?? EMPTY_STATS;

  const visible = useMemo(() => {
    const list = clients.filter((c) => c.archived === showArchived);
    const st = (id: string) => stats?.get(id) ?? EMPTY_STATS;
    return [...list].sort((a, b) =>
      sort === "name" ? clientName(a).localeCompare(clientName(b))
      : sort === "owed" ? st(b.id).owed - st(a.id).owed || compareByPriority(st(a.id), st(b.id))
      : compareByPriority(st(a.id), st(b.id)) || clientName(a).localeCompare(clientName(b)),
    );
  }, [clients, stats, sort, showArchived]);

  const archivedCount = clients.filter((c) => c.archived).length;
  const open = clients.find((c) => c.id === openId) ?? null;
  const topClient = concentrated ? clients.find((c) => c.id === concentrated.clientId) : undefined;

  const nameCell = (c: Client) => (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-medium">
        {c.key_client && <Star className="size-3.5 flex-shrink-0 fill-warning text-warning" aria-label="Key client" />}
        <span className="truncate">{clientName(c)}</span>
        <TierBadge tier={s(c.id).tier} />
      </p>
      <p className="truncate text-xs text-muted-foreground">{s(c.id).reasons[0] ?? (c.company && c.company !== c.name ? c.name : c.email || c.phone || "")}</p>
    </div>
  );

  const columns: Column<Client>[] = [
    { header: "Client", cell: nameCell, className: "max-w-[340px]" },
    { header: "Paid, 12 mo", align: "right", cell: (c) => <span className="tabular-nums">{formatKES(s(c.id).earned12m)}</span> },
    {
      header: "Owed", align: "right",
      cell: (c) => <span className={cn("tabular-nums", s(c.id).overdue > 0 ? "font-semibold text-destructive" : s(c.id).owed > 0 ? "font-semibold" : "text-muted-foreground")}>{formatKES(s(c.id).owed)}</span>,
    },
    { header: "Pays", cell: (c) => <span className={cn(s(c.id).avgDaysLate !== null && s(c.id).avgDaysLate! > 7 ? "text-warning" : "text-muted-foreground")}>{paysLabel(s(c.id))}</span> },
    { header: "Last activity", cell: (c) => <span className="text-muted-foreground">{quietLabel(s(c.id))}</span> },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title="Clients"
        subtitle="Who needs you today, and who matters most."
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-glow">
            <Plus className="size-4" /> New client
          </button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-sm text-destructive">Couldn't load clients: {(error as Error).message}</div>
      ) : (
        <>
          {!showArchived && attention && <NeedsAttention items={attention} clients={clients} />}

          {!showArchived && concentrated && topClient && (
            <p className="mb-6 rounded-2xl border border-border bg-muted px-4 py-3 text-sm sm:px-5">
              <span className="font-semibold">{clientName(topClient)} paid {Math.round(concentrated.share12m * 100)}% of your client income in the last 12 months.</span>{" "}
              <span className="text-muted-foreground">If they slowed down, most of your income would go with them. Winning one or two more clients like them spreads that risk.</span>
            </p>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl bg-secondary/40 p-1" role="group" aria-label="Sort clients">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setSort(o.key)}
                  aria-pressed={sort === o.key}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", sort === o.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {archivedCount > 0 && (
              <button onClick={() => setShowArchived((v) => !v)} className="py-2 text-sm text-muted-foreground transition hover:text-foreground">
                {showArchived ? "← Active clients" : `Archived (${archivedCount})`}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              {showArchived ? "No archived clients." : "No clients yet. Add one here or straight from a new quote or invoice."}
            </div>
          ) : (
            <div className="glass overflow-hidden rounded-2xl">
              <DataList
                rows={visible}
                columns={columns}
                keyOf={(c) => c.id}
                onRowClick={(c) => setOpenId(c.id)}
                renderCard={(c) => (
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                    {nameCell(c)}
                    <div className="flex-shrink-0 text-right">
                      <p className={cn("text-sm font-semibold tabular-nums", s(c.id).overdue > 0 && "text-destructive")}>{formatKES(s(c.id).owed)}</p>
                      <p className="text-xs text-muted-foreground">owed</p>
                    </div>
                  </div>
                )}
              />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Tiers come from what each client actually paid you in the last 12 months. Pass-through money is left out. Star a client to keep them at the top.
          </p>
        </>
      )}

      <ClientDetail
        client={open}
        stats={open ? stats?.get(open.id) : undefined}
        docs={docs ?? []}
        onClose={() => setOpenId(null)}
        onEdit={(c) => { setOpenId(null); setEditing(c); }}
      />
      <ClientModal open={creating} onClose={() => setCreating(false)} />
      <ClientModal open={!!editing} onClose={() => setEditing(null)} client={editing} />
    </div>
  );
};

export default Clients;
