import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { formatKES } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/Skeletons";
import { DataList, type Column } from "@/components/app/DataList";
import { PassThroughBadge, StatusBadge } from "@/components/invoicing/StatusBadge";
import { clientLabel, createDraft, useBusinessProfile, useDocuments, type DocumentRow } from "@/hooks/useInvoicing";
import {
  KIND_LABEL, balanceDue, displayStatus, formatDocDate,
  type DisplayStatus, type DocumentKind,
} from "@/lib/invoicing";
import { cn } from "@/lib/utils";

const FILTERS: Record<DocumentKind, { key: "all" | DisplayStatus; label: string }[]> = {
  invoice: [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "sent", label: "Unpaid" },
    { key: "overdue", label: "Overdue" },
    { key: "paid", label: "Paid" },
    { key: "void", label: "Void" },
  ],
  quote: [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "sent", label: "Open" },
    { key: "accepted", label: "Accepted" },
    { key: "declined", label: "Declined" },
    { key: "expired", label: "Expired" },
  ],
};

const Documents = ({ kind }: { kind: DocumentKind }) => {
  const label = KIND_LABEL[kind];
  usePageTitle(label.many);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useBusinessProfile();
  const { data: docs = [], isLoading, error } = useDocuments(kind);
  const [filter, setFilter] = useState<"all" | DisplayStatus>("all");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () => docs.map((d) => ({ ...d, display: displayStatus(d) })),
    [docs],
  );

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    // "Unpaid" groups sent + partly paid; overdue has its own chip.
    if (kind === "invoice" && filter === "sent") return r.display === "sent" || r.display === "partial";
    return r.display === filter;
  });

  const stats = useMemo(() => {
    if (kind === "invoice") {
      const open = rows.filter((r) => r.status === "sent");
      const overdue = rows.filter((r) => r.display === "overdue");
      const year = new Date().getFullYear().toString();
      return [
        { label: "Outstanding", value: formatKES(open.reduce((s, r) => s + balanceDue(r), 0)), sub: `${open.length} unpaid` },
        { label: "Overdue", value: formatKES(overdue.reduce((s, r) => s + balanceDue(r), 0)), sub: `${overdue.length} past due`, warn: overdue.length > 0 },
        { label: `Collected in ${year}`, value: formatKES(rows.filter((r) => r.status !== "void" && r.issue_date.startsWith(year)).reduce((s, r) => s + Number(r.amount_paid), 0)), sub: "against invoices" },
      ];
    }
    const open = rows.filter((r) => r.display === "sent");
    const accepted = rows.filter((r) => r.status === "accepted");
    const decided = rows.filter((r) => r.status === "accepted" || r.status === "declined").length;
    return [
      { label: "Open quotes", value: formatKES(open.reduce((s, r) => s + Number(r.total), 0)), sub: `${open.length} awaiting a reply` },
      { label: "Accepted", value: formatKES(accepted.reduce((s, r) => s + Number(r.total), 0)), sub: `${accepted.length} won` },
      { label: "Win rate", value: decided ? `${Math.round((accepted.length / decided) * 100)}%` : "–", sub: `of ${decided} decided` },
    ];
  }, [rows, kind]);

  const newDoc = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const id = await createDraft(kind, user.id, profile ?? null);
      navigate(`${label.path}/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  };

  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Number", cell: (r) => <span className={cn("font-medium tabular-nums", !r.number && "text-muted-foreground")}>{r.number ?? "Draft"}</span> },
    { header: "Client", cell: (r) => clientLabel(r.client_snapshot ?? r.clients) },
    { header: "Project", cell: (r) => <span className="text-muted-foreground">{r.title || "–"}</span>, className: "max-w-[260px] truncate" },
    { header: "Date", cell: (r) => <span className="tabular-nums">{formatDocDate(r.issue_date)}</span> },
    { header: kind === "invoice" ? "Due" : "Valid until", cell: (r) => <span className="tabular-nums">{formatDocDate(r.due_date) || "–"}</span> },
    {
      header: kind === "invoice" ? "Balance" : "Total", align: "right",
      cell: (r) => <span className="font-semibold tabular-nums">{formatKES(kind === "invoice" && r.status !== "draft" && r.status !== "void" ? balanceDue(r) : Number(r.total))}</span>,
    },
    { header: "Status", cell: (r) => <span className="flex items-center gap-1.5"><StatusBadge status={r.display} />{!r.counts_as_income && <PassThroughBadge />}</span> },
  ];

  const ready = !!profile?.legal_name;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title={label.many}
        subtitle={kind === "invoice" ? "Bill clients and track what's still owed." : "Price the work before it starts."}
        actions={
          <button
            onClick={newDoc} disabled={creating}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50"
          >
            <Plus className="size-4" /> New {label.one}
          </button>
        }
      />

      {profile !== undefined && !ready && (
        <div className="glass mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 sm:p-5">
          <div>
            <p className="text-sm font-medium">Add your business details first</p>
            <p className="text-sm text-muted-foreground">Your name, KRA PIN, logo and payment details print on every {label.one}.</p>
          </div>
          <Link to="/settings?tab=business" className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40">
            <Settings2 className="size-4" /> Business settings
          </Link>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", "warn" in s && s.warn && "text-destructive")}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto">
        {FILTERS[kind].map((f) => (
          <button
            key={f.key} onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === f.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-sm text-destructive">Couldn't load {label.many.toLowerCase()}: {(error as Error).message}</div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? kind === "invoice"
              ? "No invoices yet. Create one, or turn an accepted quote into an invoice."
              : "No quotes yet. Quotes you accept become invoices in one click."
            : "Nothing matches this filter."}
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <DataList
            rows={visible}
            columns={columns}
            keyOf={(r) => r.id}
            onRowClick={(r) => navigate(`${label.path}/${r.id}`)}
            renderCard={(r: DocumentRow & { display: DisplayStatus }) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{clientLabel(r.client_snapshot ?? r.clients)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.number ?? "Draft"} · {formatDocDate(r.issue_date)}{r.title ? ` · ${r.title}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">
                    {formatKES(kind === "invoice" && r.status !== "draft" && r.status !== "void" ? balanceDue(r) : Number(r.total))}
                  </span>
                  <span className="flex items-center gap-1.5">{!r.counts_as_income && <PassThroughBadge />}<StatusBadge status={r.display} /></span>
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default Documents;
