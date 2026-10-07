import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/Skeletons";
import { DataList, type Column } from "@/components/app/DataList";
import { ClientModal } from "@/components/invoicing/ClientModal";
import { clientLabel, useClients } from "@/hooks/useInvoicing";
import { balanceDue, type Client, type SalesDocument } from "@/lib/invoicing";

type Totals = Record<string, { invoiced: number; outstanding: number; count: number }>;

const Clients = () => {
  usePageTitle("Clients");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading } = useClients();
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Per-client invoice totals (finalised, not void).
  const { data: totals = {} as Totals } = useQuery({
    queryKey: ["client-totals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents").select("client_id, total, amount_paid, status")
        .eq("user_id", user!.id).eq("kind", "invoice").in("status", ["sent", "paid"]);
      const t: Totals = {};
      ((data || []) as Pick<SalesDocument, "client_id" | "total" | "amount_paid">[]).forEach((d) => {
        if (!d.client_id) return;
        t[d.client_id] ??= { invoiced: 0, outstanding: 0, count: 0 };
        t[d.client_id].invoiced += Number(d.total);
        t[d.client_id].outstanding += balanceDue(d);
        t[d.client_id].count += 1;
      });
      return t;
    },
  });

  const visible = useMemo(() => clients.filter((c) => c.archived === showArchived), [clients, showArchived]);
  const archivedCount = clients.filter((c) => c.archived).length;

  const toggleArchive = async (c: Client) => {
    const { error } = await supabase.from("clients").update({ archived: !c.archived }).eq("id", c.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    toast.success(c.archived ? "Client restored" : "Client archived");
  };

  const t = (id: string) => totals[id] ?? { invoiced: 0, outstanding: 0, count: 0 };

  const actions = (c: Client) => (
    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setEditing(c)} className="p-2 text-muted-foreground transition hover:text-foreground" aria-label="Edit client" title="Edit"><Pencil className="size-4" /></button>
      <button onClick={() => toggleArchive(c)} className="p-2 text-muted-foreground transition hover:text-foreground" aria-label={c.archived ? "Restore client" : "Archive client"} title={c.archived ? "Restore" : "Archive"}>
        {c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      </button>
    </div>
  );

  const columns: Column<Client>[] = [
    { header: "Client", cell: (c) => <><p className="font-medium">{clientLabel(c)}</p>{c.company && c.company !== c.name && <p className="text-xs text-muted-foreground">{c.name}</p>}</> },
    { header: "Contact", cell: (c) => <span className="text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "–"}</span> },
    { header: "KRA PIN", cell: (c) => <span className="text-muted-foreground">{c.kra_pin || "–"}</span> },
    { header: "Invoiced", align: "right", cell: (c) => <span className="tabular-nums">{formatKES(t(c.id).invoiced)}</span> },
    { header: "Outstanding", align: "right", cell: (c) => <span className={`tabular-nums ${t(c.id).outstanding > 0 ? "font-semibold" : "text-muted-foreground"}`}>{formatKES(t(c.id).outstanding)}</span> },
    { header: "", cell: actions, className: "w-24" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title="Clients"
        subtitle="Who you quote and bill."
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-glow">
            <Plus className="size-4" /> New client
          </button>
        }
      />

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mb-4 text-sm text-muted-foreground transition hover:text-foreground">
          {showArchived ? "← Active clients" : `Archived (${archivedCount})`}
        </button>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {showArchived ? "No archived clients." : "No clients yet. Add one here or straight from a new quote or invoice."}
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <DataList
            rows={visible}
            columns={columns}
            keyOf={(c) => c.id}
            onRowClick={(c) => setEditing(c)}
            renderCard={(c) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{clientLabel(c)}</p>
                  <p className="truncate text-xs text-muted-foreground">{[c.company && c.company !== c.name ? c.name : null, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatKES(t(c.id).outstanding)}</p>
                  <p className="text-xs text-muted-foreground">outstanding</p>
                </div>
              </div>
            )}
          />
        </div>
      )}

      <ClientModal open={creating} onClose={() => setCreating(false)} />
      <ClientModal open={!!editing} onClose={() => setEditing(null)} client={editing} />
    </div>
  );
};

export default Clients;
