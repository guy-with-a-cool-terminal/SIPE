import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban, Check, Copy, CopyPlus, Download, ExternalLink, FileText, HandCoins, Printer, ThumbsDown, ThumbsUp, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PageHeader } from "@/components/app/PageHeader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { DocumentForm, IncomeToggle } from "@/components/invoicing/DocumentForm";
import { DocumentPaper, PaperFrame } from "@/components/invoicing/DocumentPaper";
import { RecordPaymentModal } from "@/components/invoicing/RecordPaymentModal";
import { PassThroughBadge, StatusBadge } from "@/components/invoicing/StatusBadge";
import { clientLabel, createDraft, useBusinessProfile } from "@/hooks/useInvoicing";
import { field } from "@/lib/forms";
import { downloadPaperPdf, pdfFileName } from "@/lib/pdf";
import {
  KIND_LABEL, PAYMENT_METHOD_LABEL, balanceDue, displayStatus, formatDocDate,
  type Client, type DocumentItem, type DocumentKind, type DocumentPayment, type SalesDocument,
} from "@/lib/invoicing";

interface Loaded {
  doc: SalesDocument;
  items: DocumentItem[];
  payments: DocumentPayment[];
  client: Client | null;
  quoteNumber: string | null;
  invoices: Pick<SalesDocument, "id" | "number" | "status">[];
}

async function loadDocument(id: string): Promise<Loaded | null> {
  const { data: doc, error } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!doc) return null;
  const d = doc as SalesDocument;
  const [items, payments, client, quote, invoices] = await Promise.all([
    supabase.from("document_items").select("*").eq("document_id", id).order("position"),
    supabase.from("document_payments").select("*").eq("document_id", id).order("paid_at"),
    d.client_id ? supabase.from("clients").select("*").eq("id", d.client_id).maybeSingle() : Promise.resolve({ data: null }),
    d.source_quote_id ? supabase.from("documents").select("number").eq("id", d.source_quote_id).maybeSingle() : Promise.resolve({ data: null }),
    d.kind === "quote" ? supabase.from("documents").select("id, number, status").eq("source_quote_id", id) : Promise.resolve({ data: [] }),
  ]);
  return {
    doc: d,
    items: (items.data || []) as DocumentItem[],
    payments: (payments.data || []) as DocumentPayment[],
    client: (client.data as Client | null) ?? null,
    quoteNumber: (quote.data as { number: string | null } | null)?.number ?? null,
    invoices: (invoices.data || []) as Loaded["invoices"],
  };
}

const DocumentPage = ({ kind }: { kind: DocumentKind }) => {
  const { id } = useParams<{ id: string }>();
  const label = KIND_LABEL[kind];
  const { data: profile, isLoading: profileLoading } = useBusinessProfile();
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", id],
    enabled: !!id,
    queryFn: () => loadDocument(id!),
  });
  usePageTitle(data?.doc.number ?? `Draft ${label.one}`);

  const container = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10";

  if (isLoading || profileLoading) {
    return <div className={container}><PageHeader title={label.title} /><CardGridSkeleton count={2} className="grid gap-4" /></div>;
  }
  if (error || !data || data.doc.kind !== kind) {
    return (
      <div className={container}>
        <PageHeader title={`${label.title} not found`} />
        <p className="text-sm text-muted-foreground">
          {error ? (error as Error).message : `It may have been a draft that was deleted.`}{" "}
          <Link to={label.path} className="text-primary underline">Back to {label.many.toLowerCase()}</Link>
        </p>
      </div>
    );
  }

  if (data.doc.status === "draft") {
    // Keyed by id: the form owns its state, and a background refetch after a save must not reset it.
    return <DocumentForm key={data.doc.id} doc={data.doc} items={data.items} profile={profile ?? null} />;
  }
  return <FinalisedView data={data} />;
};

// ─── Finalised document ────────────────────────────────────────────────────

const FinalisedView = ({ data }: { data: Loaded }) => {
  const { doc, items, payments, client, quoteNumber, invoices } = data;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const label = KIND_LABEL[doc.kind];
  const isInvoice = doc.kind === "invoice";
  const status = displayStatus(doc);
  const clientInfo = doc.client_snapshot ?? client;
  const name = clientLabel(clientInfo);
  const [paying, setPaying] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [etims, setEtims] = useState(doc.etims_number ?? "");
  const [payLink, setPayLink] = useState(doc.payment_link_url ?? "");

  const shareUrl = `${window.location.origin}/d/${doc.public_token}`;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["document", doc.id] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const paperRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (!paperRef.current) return;
    setDownloading(true);
    try {
      await downloadPaperPdf(paperRef.current, pdfFileName(doc.number, name));
    } catch (e) {
      toast.error(`Couldn't create the PDF: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  const print = () => {
    // The browser uses the page title as the PDF file name.
    const previous = document.title;
    document.title = [doc.number, name].filter(Boolean).join(" ").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-");
    window.print();
    document.title = previous;
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const update = async (patch: Partial<SalesDocument>, ok: string) => {
    setBusy(true);
    const { error } = await supabase.from("documents").update(patch).eq("id", doc.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(ok);
    refresh();
  };

  const convert = async () => {
    setBusy(true);
    const { data: newId, error } = await supabase.rpc("convert_quote_to_invoice", { p_id: doc.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Invoice draft created from the quote");
    navigate(`/invoices/${newId}`);
  };

  const duplicate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { data: bp } = await supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle();
      const newId = await createDraft(doc.kind, user.id, bp, {
        client_id: doc.client_id, title: doc.title, summary: doc.summary, deliverables: doc.deliverables,
        timeline: doc.timeline, payment_terms: doc.payment_terms, notes: doc.notes, terms: doc.terms,
        discount_type: doc.discount_type, discount_value: doc.discount_value, tax_rate: doc.tax_rate, tax_label: doc.tax_label,
        counts_as_income: doc.counts_as_income,
      });
      if (items.length) {
        const { error } = await supabase.from("document_items").insert(items.map((i) => ({
          document_id: newId, user_id: user.id, position: i.position, description: i.description,
          details: i.details, quantity: i.quantity, unit_price: i.unit_price,
        })));
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Copied to a new draft");
      navigate(`${label.path}/${newId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (p: DocumentPayment) => {
    const { error } = await supabase.from("document_payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.transaction_id ? "Payment removed. The income stays in Transactions." : "Payment removed");
    refresh();
  };

  const secondary = "flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40 disabled:opacity-50";
  const primary = "flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50";
  const live = doc.status !== "void";

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10 print:p-0 print:max-w-none">
      <div className="print:hidden">
        <PageHeader
          title={<span className="flex flex-wrap items-center gap-3">{doc.number}<StatusBadge status={status} className="text-sm" />{!doc.counts_as_income && <PassThroughBadge />}</span>}
          subtitle={<><Link to={label.path} className="hover:text-foreground transition">← All {label.many.toLowerCase()}</Link> · {name}</>}
          actions={
            <>
              <button onClick={download} disabled={downloading} className={secondary}><Download className="size-4" /> {downloading ? "Preparing…" : "Download PDF"}</button>
              {live && <button onClick={copyLink} className={secondary}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Share link"}</button>}
              {isInvoice && doc.status === "sent" && <button onClick={() => setPaying(true)} className={primary}><HandCoins className="size-4" /> Record payment</button>}
              {!isInvoice && (doc.status === "sent" || doc.status === "accepted") && invoices.length === 0 && (
                <button onClick={convert} disabled={busy} className={primary}><FileText className="size-4" /> Convert to invoice</button>
              )}
            </>
          }
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0">
          <div ref={paperRef}>
          <PaperFrame className="mx-auto max-w-[794px]">
            <DocumentPaper
              kind={doc.kind} status={status === "partial" || status === "overdue" ? "sent" : status}
              number={doc.number} doc={doc} items={items}
              totals={{ subtotal: Number(doc.subtotal), discount: Number(doc.discount_amount), tax: Number(doc.tax_amount), total: Number(doc.total) }}
              amountPaid={Number(doc.amount_paid)} issuer={doc.issuer_snapshot} client={clientInfo}
              payments={payments} quoteNumber={quoteNumber}
            />
          </PaperFrame>
          </div>
        </div>

        <aside className="space-y-4 print:hidden">
          {isInvoice && (
            <Card title="Payment">
              <dl className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd>{formatKES(Number(doc.total))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd>{formatKES(Number(doc.amount_paid))}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Balance</dt><dd>{formatKES(balanceDue(doc))}</dd></div>
              </dl>
              {payments.length > 0 && (
                <ul className="mt-4 divide-y divide-border border-t border-border">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">{formatKES(Number(p.amount))}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDocDate(p.paid_at)} · {PAYMENT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                          {p.transaction_id ? " · split" : ""}
                        </p>
                      </div>
                      <button onClick={() => removePayment(p)} className="p-2 text-muted-foreground transition hover:text-destructive" aria-label="Remove payment" title="Remove payment">
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {live && (
                <IncomeToggle
                  className="mt-4" disabled={busy} checked={doc.counts_as_income}
                  onChange={(v) => update({ counts_as_income: v }, v ? "Future payments count as income" : "Marked as pass-through")}
                />
              )}
              {payments.some((p) => p.transaction_id) && !doc.counts_as_income && (
                <p className="mt-2 text-xs text-warning">
                  Payments marked "split" are already in your buckets. Delete those deposits in Transactions to take them out.
                </p>
              )}
            </Card>
          )}

          {!isInvoice && (
            <Card title="Client's answer">
              {invoices.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {invoices.map((inv) => (
                    <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 transition hover:bg-secondary/30">
                      <span>{inv.number ?? "Draft invoice"}</span><ExternalLink className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : doc.status === "sent" ? (
                <div className="flex gap-2">
                  <button onClick={() => update({ status: "accepted", accepted_at: new Date().toISOString() }, "Marked accepted")} disabled={busy} className={`${secondary} flex-1 justify-center`}><ThumbsUp className="size-4" /> Accepted</button>
                  <button onClick={() => update({ status: "declined" }, "Marked declined")} disabled={busy} className={`${secondary} flex-1 justify-center`}><ThumbsDown className="size-4" /> Declined</button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {doc.status === "accepted" ? `Accepted ${formatDocDate(doc.accepted_at)}.` : doc.status === "declined" ? "Declined." : "Withdrawn."}
                  {doc.status === "declined" && (
                    <button onClick={() => update({ status: "sent" }, "Reopened")} className="ml-1 text-primary underline">Reopen</button>
                  )}
                </p>
              )}
            </Card>
          )}

          {isInvoice && live && (
            <Card title="KRA & online payment">
              <label className="block">
                <span className="text-sm text-muted-foreground">eTIMS invoice no.</span>
                <input className={field} value={etims} onChange={(e) => setEtims(e.target.value)} />
              </label>
              <label className="mt-3 block">
                <span className="text-sm text-muted-foreground">Online payment link</span>
                <input className={field} type="url" value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://paystack.com/pay/…" />
              </label>
              {(etims !== (doc.etims_number ?? "") || payLink !== (doc.payment_link_url ?? "")) && (
                <button
                  onClick={() => update({ etims_number: etims.trim() || null, payment_link_url: payLink.trim() || null }, "Saved")}
                  disabled={busy} className={`${primary} mt-3`}
                >
                  Save
                </button>
              )}
            </Card>
          )}

          <Card title="More">
            <div className="flex flex-col gap-1">
              <MenuButton onClick={print} icon={<Printer className="size-4" />}>Print</MenuButton>
              <MenuButton onClick={duplicate} disabled={busy} icon={<CopyPlus className="size-4" />}>Duplicate as new draft</MenuButton>
              {live && (
                <a href={shareUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                  <ExternalLink className="size-4" /> Open client view
                </a>
              )}
              {live && (
                <MenuButton onClick={() => setConfirmVoid(true)} disabled={busy} icon={<Ban className="size-4" />} danger>
                  Void {label.one}
                </MenuButton>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Finalised {formatDocDate(doc.sent_at)}. {isInvoice ? "Amounts are locked; void and duplicate to correct one." : "Duplicate to send a revised quote."}
            </p>
          </Card>
        </aside>
      </div>

      {isInvoice && (
        <RecordPaymentModal open={paying} onClose={() => setPaying(false)} invoice={doc} clientName={name} onSaved={refresh} />
      )}
      <ConfirmDialog
        open={confirmVoid} onOpenChange={setConfirmVoid} destructive
        title={`Void ${doc.number}?`}
        description={
          isInvoice && Number(doc.amount_paid) > 0
            ? "It keeps its number and shows VOID. Payments already recorded stay in your transactions."
            : "It keeps its number and shows VOID. The share link stops showing amounts as payable."
        }
        confirmLabel="Void" onConfirm={() => update({ status: "void", voided_at: new Date().toISOString() }, `${doc.number} voided`)}
      />
    </div>
  );
};

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="glass rounded-2xl p-5">
    <h2 className="mb-3 text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

const MenuButton = ({
  onClick, disabled, icon, danger, children,
}: { onClick: () => void; disabled?: boolean; icon: ReactNode; danger?: boolean; children: ReactNode }) => (
  <button
    onClick={onClick} disabled={disabled}
    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-secondary disabled:opacity-50 ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}
  >
    {icon} {children}
  </button>
);

export default DocumentPage;
