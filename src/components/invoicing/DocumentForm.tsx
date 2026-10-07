import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronUp, Eye, Plus, Settings2, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/app/PageHeader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { field } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { clientLabel, useClients } from "@/hooks/useInvoicing";
import { ClientModal } from "./ClientModal";
import { DocumentPaper, PaperFrame, type PaperDoc } from "./DocumentPaper";
import {
  KIND_LABEL, computeTotals, formatDocNumber, lineAmount,
  type BusinessProfile, type DiscountType, type DocumentItem, type SalesDocument,
} from "@/lib/invoicing";

interface ItemRow { key: string; description: string; details: string; quantity: string; unit_price: string }

const newKey = () => Math.random().toString(36).slice(2);
const blankItem = (): ItemRow => ({ key: newKey(), description: "", details: "", quantity: "1", unit_price: "" });
const textarea = `${field} min-h-[88px] resize-y leading-relaxed`;

interface Props {
  doc: SalesDocument;
  items: DocumentItem[];
  profile: BusinessProfile | null;
}

/** The draft editor: form on the left, live A4 preview on the right (or behind a tab on small screens). */
export const DocumentForm = ({ doc, items: initialItems, profile }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const label = KIND_LABEL[doc.kind];
  const isInvoice = doc.kind === "invoice";

  const [f, setF] = useState({
    client_id: doc.client_id ?? "",
    title: doc.title ?? "",
    summary: doc.summary ?? "",
    deliverables: (doc.deliverables ?? []).join("\n"),
    reference: doc.reference ?? "",
    timeline: doc.timeline ?? "",
    payment_terms: doc.payment_terms ?? "",
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
    etims_number: doc.etims_number ?? "",
    issue_date: doc.issue_date,
    due_date: doc.due_date ?? "",
    discount_type: doc.discount_type as DiscountType,
    discount_value: doc.discount_value ? String(doc.discount_value) : "",
    tax_rate: Number(doc.tax_rate) ? String(doc.tax_rate) : "",
    tax_label: doc.tax_label || "VAT",
    payment_link_url: doc.payment_link_url ?? "",
  });
  const [items, setItems] = useState<ItemRow[]>(() =>
    initialItems.length
      ? initialItems.map((i) => ({
          key: i.id ?? newKey(), description: i.description, details: i.details ?? "",
          quantity: String(i.quantity), unit_price: String(i.unit_price),
        }))
      : [blankItem()],
  );
  const [countsAsIncome, setCountsAsIncome] = useState(doc.counts_as_income ?? true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [clientModal, setClientModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((p) => ({ ...p, [k]: v })); setDirty(true); };
  const bind = (k: keyof typeof f) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });
  const setItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setDirty(true);
  };
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => { const next = [...prev]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
    setDirty(true);
  };

  const cleanItems: DocumentItem[] = items
    .filter((i) => i.description.trim() || Number(i.unit_price))
    .map((i, position) => ({
      position,
      description: i.description.trim(),
      details: i.details.trim() || null,
      quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
      unit_price: Math.max(0, Number(i.unit_price) || 0),
    }));
  const taxRate = Number(f.tax_rate) || 0;
  const totals = computeTotals(cleanItems, f.discount_type, Number(f.discount_value) || 0, taxRate);
  const client = clients.find((c) => c.id === f.client_id) ?? null;

  const paperDoc: PaperDoc = useMemo(() => ({
    title: f.title || null,
    summary: f.summary || null,
    deliverables: f.deliverables.split("\n").map((s) => s.trim()).filter(Boolean),
    reference: f.reference || null,
    timeline: f.timeline || null,
    payment_terms: f.payment_terms || null,
    notes: f.notes || null,
    terms: f.terms || null,
    etims_number: f.etims_number || null,
    issue_date: f.issue_date,
    due_date: f.due_date || null,
    discount_type: f.discount_type,
    discount_value: Number(f.discount_value) || 0,
    tax_rate: taxRate,
    tax_label: f.tax_label || "VAT",
    payment_link_url: f.payment_link_url || null,
  }), [f, taxRate]);

  const save = async (quiet = false): Promise<boolean> => {
    if (cleanItems.some((i) => !i.description)) {
      toast.error("Every line item needs a description");
      return false;
    }
    setSaving(true);
    const { error } = await supabase.from("documents").update({
      client_id: f.client_id || null,
      counts_as_income: countsAsIncome,
      ...paperDoc,
      deliverables: paperDoc.deliverables,
    }).eq("id", doc.id);
    if (error) { setSaving(false); toast.error(error.message); return false; }

    // Drafts only: replace the item set wholesale.
    const del = await supabase.from("document_items").delete().eq("document_id", doc.id);
    if (del.error) { setSaving(false); toast.error(del.error.message); return false; }
    if (cleanItems.length) {
      const ins = await supabase.from("document_items").insert(
        cleanItems.map((i) => ({ ...i, document_id: doc.id, user_id: user!.id })),
      );
      if (ins.error) { setSaving(false); toast.error(ins.error.message); return false; }
    }
    setSaving(false);
    setDirty(false);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["document", doc.id] });
    if (!quiet) toast.success("Draft saved");
    return true;
  };

  const problems = [
    !profile?.legal_name && "your business name (Settings › Business)",
    !f.client_id && "a client",
    cleanItems.length === 0 && "at least one line item",
    f.due_date && f.due_date < f.issue_date && `a ${isInvoice ? "due" : "valid-until"} date on or after the issue date`,
  ].filter(Boolean) as string[];

  const finalise = async () => {
    setPreviewOpen(false);
    if (!(await save(true))) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("finalise_document", { p_id: doc.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["document", doc.id] });
    queryClient.invalidateQueries({ queryKey: ["business-profile"] });
    toast.success(`${(data as SalesDocument).number} is ready to send`);
  };

  const remove = async () => {
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    setDirty(false);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    toast.success("Draft deleted");
    navigate(label.path);
  };

  const nextNumber = formatDocNumber(
    isInvoice ? profile?.invoice_prefix ?? "INV" : profile?.quote_prefix ?? "QT",
    f.issue_date,
    (isInvoice ? profile?.next_invoice_seq : profile?.next_quote_seq) ?? 1,
  );

  const preview = (
    <PaperFrame className="mx-auto max-w-[794px]">
      <DocumentPaper
        kind={doc.kind} status="draft" number={null} doc={paperDoc} items={cleanItems}
        totals={totals} amountPaid={0} issuer={profile} client={client}
        quoteNumber={null}
      />
    </PaperFrame>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title={`Draft ${label.one}`}
        subtitle={<Link to={label.path} className="hover:text-foreground transition">← All {label.many.toLowerCase()}</Link>}
        actions={
          <>
            <button onClick={() => setConfirmDelete(true)} className="p-2.5 text-muted-foreground transition hover:text-destructive" aria-label="Delete draft" title="Delete draft">
              <Trash2 className="size-4" />
            </button>
            <button onClick={() => save()} disabled={saving || !dirty} className="rounded-full border border-border px-4 py-2 font-semibold transition hover:bg-secondary/40 disabled:opacity-50">
              {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
            </button>
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 font-semibold transition hover:bg-secondary/40"
            >
              <Eye className="size-4" /> Preview
            </button>
            <button
              onClick={() => setPreviewOpen(true)}
              disabled={saving}
              className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50"
            >
              Finalise
            </button>
          </>
        }
      />

      {!profile?.legal_name && (
        <div className="glass mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <p className="text-sm text-muted-foreground">Your business details are empty, so the preview shows a placeholder issuer.</p>
          <Link to="/settings?tab=business" className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40">
            <Settings2 className="size-4" /> Business settings
          </Link>
        </div>
      )}

      {/* Small screens: edit / preview toggle */}
      <div className="mb-4 flex gap-1 rounded-xl bg-secondary/40 p-1 xl:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button
            key={v} onClick={() => setView(v)}
            className={cn("flex-1 rounded-lg py-1.5 text-sm font-medium transition", view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {v === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:items-start">
        <div className={cn("space-y-5 min-w-0", view === "preview" && "hidden xl:block")}>
          <Panel title={isInvoice ? "Bill to" : "Prepared for"}>
            <div className="flex gap-2">
              <select className={`${field} !mt-0`} {...bind("client_id")}>
                <option value="">Choose a client…</option>
                {clients.filter((c) => !c.archived || c.id === f.client_id).map((c) => (
                  <option key={c.id} value={c.id}>{clientLabel(c)}{c.company && c.company !== c.name ? ` · ${c.name}` : ""}</option>
                ))}
              </select>
              <button type="button" onClick={() => setClientModal(true)} className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-secondary/40" title="New client">
                <UserPlus className="size-4" /> <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </Panel>

          <Panel title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <L label={isInvoice ? "Issue date" : "Date"}><input type="date" className={field} {...bind("issue_date")} /></L>
              <L label={isInvoice ? "Due date" : "Valid until"}><input type="date" className={field} {...bind("due_date")} /></L>
              <L label="Reference" hint="Client PO or your own ref"><input className={field} {...bind("reference")} /></L>
              {isInvoice && <L label="eTIMS invoice no." hint="If you also issued it on KRA eTIMS"><input className={field} {...bind("etims_number")} /></L>}
            </div>
            <IncomeToggle checked={countsAsIncome} onChange={(v) => { setCountsAsIncome(v); setDirty(true); }} className="mt-4" />
          </Panel>

          <Panel title="Project">
            <div className="space-y-4">
              <L label="Title"><input className={field} placeholder="Company website" {...bind("title")} /></L>
              <L label="Summary"><textarea className={textarea} placeholder="What you're delivering and why, in two or three sentences." {...bind("summary")} /></L>
              <L label={isInvoice ? "Delivered (one per line)" : "Features & deliverables (one per line)"}>
                <textarea className={`${textarea} min-h-[120px]`} placeholder={"Responsive website\nM-Pesa checkout\nAdmin dashboard"} {...bind("deliverables")} />
              </L>
            </div>
          </Panel>

          <Panel title="Line items">
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.key} className="rounded-xl border border-border bg-secondary/10 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col pt-1.5 text-muted-foreground">
                      <button type="button" onClick={() => moveItem(idx, idx - 1)} disabled={idx === 0} aria-label="Move up" className="disabled:opacity-30"><ChevronUp className="size-4" /></button>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input className={`${field} !mt-0`} placeholder="Description" value={it.description} onChange={(e) => setItem(it.key, { description: e.target.value })} />
                      <input className={`${field} !mt-0 !py-2 text-sm`} placeholder="Details (optional)" value={it.details} onChange={(e) => setItem(it.key, { details: e.target.value })} />
                      <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
                        <input className={`${field} !mt-0`} type="number" min={0} step="0.01" aria-label="Quantity" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} />
                        <input className={`${field} !mt-0`} type="number" min={0} step="0.01" placeholder="Unit price" aria-label="Unit price" value={it.unit_price} onChange={(e) => setItem(it.key, { unit_price: e.target.value })} />
                        <span className="min-w-[96px] text-right text-sm font-semibold tabular-nums">
                          {formatKES(lineAmount({ quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 }))}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button" aria-label="Remove item"
                      onClick={() => { setItems((p) => p.length > 1 ? p.filter((x) => x.key !== it.key) : [blankItem()]); setDirty(true); }}
                      className="p-1.5 text-muted-foreground transition hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button" onClick={() => { setItems((p) => [...p, blankItem()]); setDirty(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground"
              >
                <Plus className="size-4" /> Add line item
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-sm text-muted-foreground">Discount</span>
                <div className="mt-1.5 flex gap-2">
                  <select className={`${field} !mt-0 !w-24 flex-shrink-0`} {...bind("discount_type")}>
                    <option value="amount">KES</option>
                    <option value="percent">%</option>
                  </select>
                  <input className={`${field} !mt-0`} type="number" min={0} step="0.01" placeholder="0" {...bind("discount_value")} />
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Tax</span>
                <div className="mt-1.5 flex gap-2">
                  <input className={`${field} !mt-0 !w-24 flex-shrink-0`} {...bind("tax_label")} aria-label="Tax label" />
                  <input className={`${field} !mt-0`} type="number" min={0} max={100} step="0.01" placeholder="0 %" {...bind("tax_rate")} aria-label="Tax rate" />
                </div>
                {!profile?.vat_registered && taxRate > 0 && (
                  <p className="mt-1 text-xs text-warning">You're not marked as VAT-registered in Settings.</p>
                )}
              </div>
            </div>

            <dl className="mt-5 space-y-1 border-t border-border pt-4 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatKES(totals.subtotal)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>− {formatKES(totals.discount)}</dd></div>}
              {totals.tax > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{f.tax_label || "VAT"}</dt><dd>{formatKES(totals.tax)}</dd></div>}
              <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatKES(totals.total)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Terms & notes">
            <div className="space-y-4">
              {!isInvoice && <L label="Timeline"><textarea className={textarea} placeholder="7 to 13 working days from deposit and content." {...bind("timeline")} /></L>}
              <L label="Payment terms"><textarea className={textarea} {...bind("payment_terms")} /></L>
              {isInvoice && <L label="Online payment link" hint="Optional: a Paystack or other link printed under How to pay"><input className={field} type="url" placeholder="https://paystack.com/pay/…" {...bind("payment_link_url")} /></L>}
              <L label="Notes"><textarea className={textarea} {...bind("notes")} /></L>
              <L label={isInvoice ? "Terms" : "Terms of agreement"} hint="Supports **bold**, ### headings and - bullet lists">
                <textarea className={`${textarea} min-h-[140px]`} {...bind("terms")} />
              </L>
            </div>
          </Panel>
        </div>

        <div className={cn("min-w-0 xl:sticky xl:top-6", view === "edit" && "hidden xl:block")}>
          {preview}
        </div>
      </div>

      <ClientModal open={clientModal} onClose={() => setClientModal(false)} onSaved={(c) => set("client_id", c.id)} />
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete} destructive
        title="Delete this draft?" description="It has no number yet, so nothing is lost from your sequence."
        confirmLabel="Delete draft" onConfirm={remove}
      />
      {/* Full-size preview: exactly what the client gets, with the number it will receive. Finalising happens from here. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="glass flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[900px] flex-col gap-0 rounded-2xl border-border p-0 sm:rounded-2xl">
          <div className="flex-shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle className="text-lg font-bold">Preview</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              How {client ? clientLabel(client) : "your client"} will see it. It becomes {nextNumber} when you finalise.
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-secondary/20 p-3 sm:p-6">
            <PaperFrame className="mx-auto max-w-[794px]">
              <DocumentPaper
                kind={doc.kind} status="sent" number={nextNumber} doc={paperDoc} items={cleanItems}
                totals={totals} amountPaid={0} issuer={profile} client={client} quoteNumber={null}
              />
            </PaperFrame>
          </div>
          <div className="flex-shrink-0 border-t border-border px-5 py-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
            {problems.length > 0 ? (
              <p className="mb-3 flex items-start gap-2 text-sm text-warning">
                <AlertCircle className="mt-0.5 size-4 flex-shrink-0" /> To finalise, add {problems.join(", ")}.
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">
                {isInvoice
                  ? "Finalising gives it the next invoice number and locks your business and client details. To change amounts afterwards you void it and issue a new one."
                  : "Finalising gives it the next quote number and makes it shareable. You can still duplicate it to send a revised quote."}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setPreviewOpen(false)} className="rounded-full border border-border px-4 py-2 font-semibold transition hover:bg-secondary/40">
                Keep editing
              </button>
              <button
                onClick={finalise} disabled={saving || problems.length > 0}
                className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50"
              >
                {saving ? "Finalising…" : `Finalise as ${nextNumber}`}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Income vs pass-through. Shared by the draft form and the finalised invoice view. */
export const IncomeToggle = ({
  checked, onChange, disabled, className = "",
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; className?: string }) => (
  <label className={`flex items-start gap-3 rounded-xl border border-border p-3 text-sm ${className}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
    <span>
      Payments count as my income
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {checked
          ? "Split into your buckets and included in analytics."
          : "Pass-through money (brokerage, a float): tracked on this invoice only, never in your buckets or analytics."}
      </span>
    </span>
  </label>
);

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="glass rounded-2xl p-5">
    <h2 className="mb-4 text-base font-semibold">{title}</h2>
    {children}
  </section>
);

const L = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="text-sm text-muted-foreground">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </label>
);
