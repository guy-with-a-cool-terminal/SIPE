import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile } from "@/hooks/useInvoicing";
import { field } from "@/lib/forms";
import { SWATCHES } from "@/lib/swatches";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { DocumentPaper, PaperFrame } from "./DocumentPaper";
import {
  computeTotals, formatDocNumber, normalizeHex, todayISODate, addDays,
  type BusinessProfile, type DocumentItem,
} from "@/lib/invoicing";

type Form = Omit<BusinessProfile, "user_id">;

const EMPTY: Form = {
  legal_name: "", trading_name: "", tagline: "", kra_pin: "", email: "", phone: "", website: "", address: "",
  logo_url: null, brand_color: "#0f172a", header_style: "band",
  vat_registered: false, default_tax_rate: 16,
  bank_name: "", bank_branch: "", bank_account_name: "", bank_account_number: "", bank_swift: "",
  mpesa_paybill: "", mpesa_account: "", mpesa_till: "", mpesa_phone: "", payment_note: "",
  invoice_prefix: "INV", quote_prefix: "QT", next_invoice_seq: 1, next_quote_seq: 1,
  default_due_days: 14, default_valid_days: 30, default_counts_as_income: true,
  invoice_notes: "", invoice_terms: "", quote_notes: "", quote_terms: "", quote_payment_terms: "",
  signatory_name: "", signatory_title: "", footer_text: "",
};

const SAMPLE_ITEMS: DocumentItem[] = [
  { position: 0, description: "Website design & development", details: "Responsive, 6 pages", quantity: 1, unit_price: 45000 },
  { position: 1, description: "M-Pesa payment integration", details: null, quantity: 1, unit_price: 12000 },
];

const textarea = `${field} min-h-[96px] resize-y leading-relaxed`;

export const BusinessSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useBusinessProfile();
  const [f, setF] = useState<Form>(EMPTY);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the form once from the server; after that the form owns the values.
  useEffect(() => {
    if (isLoading || seeded) return;
    if (profile) {
      const { user_id: _u, ...rest } = profile;
      const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v ?? (typeof EMPTY[k as keyof Form] === "string" ? "" : v)]));
      setF({ ...EMPTY, ...clean } as Form);
    } else if (user?.email) {
      setF((p) => ({ ...p, email: user.email ?? "" }));
    }
    setSeeded(true);
  }, [isLoading, seeded, profile, user]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: keyof Form) => ({
    value: (f[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  const uploadLogo = async (file: File) => {
    if (!user) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast.error("Use a PNG, JPG or WebP image");
    if (file.size > 1024 * 1024) return toast.error("Logo must be under 1 MB");
    setUploading(true);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("brand").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("brand").getPublicUrl(path);
    set("logo_url", data.publicUrl);
    toast.success("Logo uploaded. Save to apply it");
  };

  const save = async () => {
    if (!user) return;
    if (!f.legal_name?.trim()) return toast.error("Enter your registered business name");
    const color = normalizeHex(f.brand_color);
    if (!color) return toast.error("Brand color must be a hex value like #0f172a");
    setSaving(true);
    const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, blankToNull(v)]));
    const { error } = await supabase.from("business_profiles").upsert({
      ...payload,
      user_id: user.id,
      brand_color: color,
      invoice_prefix: f.invoice_prefix.trim(),
      quote_prefix: f.quote_prefix.trim(),
      next_invoice_seq: Math.max(1, Math.floor(Number(f.next_invoice_seq) || 1)),
      next_quote_seq: Math.max(1, Math.floor(Number(f.next_quote_seq) || 1)),
      default_due_days: Math.max(0, Math.floor(Number(f.default_due_days) || 0)),
      default_valid_days: Math.max(0, Math.floor(Number(f.default_valid_days) || 0)),
      default_tax_rate: Number(f.default_tax_rate) || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["business-profile"] });
    toast.success("Business details saved");
  };

  const today = todayISODate();
  const year = today.slice(0, 4);
  const sampleTotals = useMemo(() => computeTotals(SAMPLE_ITEMS, "amount", 0, f.vat_registered ? Number(f.default_tax_rate) : 0), [f.vat_registered, f.default_tax_rate]);

  if (isLoading || !seeded) return <CardGridSkeleton count={3} className="grid gap-4" />;

  const numberExample = (prefix: string, seq: number) => formatDocNumber(prefix, today, seq);

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px] 2xl:items-start">
      <div className="space-y-6 min-w-0">
        <Section title="Business identity" hint="Shown as the issuer on every quote and invoice. Use the name you're registered under, the one your clients pay.">
          <Grid>
            <Field label="Registered business name" required><input className={field} placeholder="Brian AI Studio" {...text("legal_name")} /></Field>
            <Field label="Trading name" hint="Only if different from the registered name"><input className={field} {...text("trading_name")} /></Field>
            <Field label="KRA PIN"><input className={`${field} uppercase`} placeholder="A000000000X" {...text("kra_pin")} /></Field>
            <Field label="Tagline"><input className={field} placeholder="Software & AI products" {...text("tagline")} /></Field>
            <Field label="Email"><input className={field} type="email" {...text("email")} /></Field>
            <Field label="Phone"><input className={field} type="tel" placeholder="+254 7…" {...text("phone")} /></Field>
            <Field label="Website"><input className={field} placeholder="example.co.ke" {...text("website")} /></Field>
            <Field label="Address"><textarea className={`${field} min-h-[72px] resize-y`} placeholder={"Nairobi, Kenya"} {...text("address")} /></Field>
          </Grid>
        </Section>

        <Section title="Branding" hint="No logo yet? Leave it empty and your business name is set as a clean wordmark.">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-40 place-items-center overflow-hidden rounded-xl border border-border bg-white">
              {f.logo_url
                ? <img src={f.logo_url} alt="Logo" className="max-h-12 max-w-[136px] object-contain" />
                : <span className="text-xs text-slate-500">No logo</span>}
            </div>
            <input
              ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadLogo(file); e.target.value = ""; }}
            />
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40 disabled:opacity-50"
            >
              <ImagePlus className="size-4" /> {uploading ? "Uploading…" : f.logo_url ? "Replace logo" : "Upload logo"}
            </button>
            {f.logo_url && (
              <button type="button" onClick={() => set("logo_url", null)} className="flex items-center gap-1.5 p-2.5 text-sm text-muted-foreground transition hover:text-destructive">
                <Trash2 className="size-4" /> Remove
              </button>
            )}
            <p className="w-full text-xs text-muted-foreground">PNG with a transparent background works best. Under 1 MB.</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm text-muted-foreground">Brand color</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color" aria-label="Pick brand color"
                  value={normalizeHex(f.brand_color) ?? "#0f172a"}
                  onChange={(e) => set("brand_color", e.target.value)}
                  className="h-11 w-12 flex-shrink-0 cursor-pointer rounded-xl border border-border bg-input p-1"
                />
                <input className={`${field} !mt-0 font-mono`} value={f.brand_color} onChange={(e) => set("brand_color", e.target.value)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["#0f172a", ...SWATCHES].map((c) => (
                  <button
                    key={c} type="button" onClick={() => set("brand_color", c)} aria-label={`Use ${c}`}
                    className={`size-7 rounded-full border-2 transition ${normalizeHex(f.brand_color) === c ? "border-foreground" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Header style</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(["band", "minimal"] as const).map((s) => (
                  <button
                    key={s} type="button" onClick={() => set("header_style", s)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      f.header_style === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/40"
                    }`}
                  >
                    {s === "band" ? "Color band" : "Minimal"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="How clients pay you" hint="Printed in the “How to pay” box on unpaid invoices. Fill in only what you use.">
          <h3 className="mb-3 text-sm font-medium">Bank</h3>
          <Grid>
            <Field label="Bank"><input className={field} {...text("bank_name")} /></Field>
            <Field label="Branch"><input className={field} {...text("bank_branch")} /></Field>
            <Field label="Account name"><input className={field} {...text("bank_account_name")} /></Field>
            <Field label="Account number"><input className={field} inputMode="numeric" {...text("bank_account_number")} /></Field>
            <Field label="SWIFT / bank code"><input className={field} {...text("bank_swift")} /></Field>
          </Grid>
          <h3 className="mb-3 mt-6 text-sm font-medium">M-Pesa</h3>
          <Grid>
            <Field label="Paybill"><input className={field} inputMode="numeric" {...text("mpesa_paybill")} /></Field>
            <Field label="Paybill account" hint="Leave empty to use the invoice number"><input className={field} {...text("mpesa_account")} /></Field>
            <Field label="Till (Buy goods)"><input className={field} inputMode="numeric" {...text("mpesa_till")} /></Field>
            <Field label="Send money to"><input className={field} type="tel" {...text("mpesa_phone")} /></Field>
          </Grid>
          <Field label="Extra payment note" className="mt-4">
            <textarea className={`${field} min-h-[72px] resize-y`} placeholder="Please use the invoice number as the payment reference." {...text("payment_note")} />
          </Field>
        </Section>

        <Section title="Tax" hint="Only charge VAT if you are VAT-registered with KRA. Not sure? Leave it off.">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={f.vat_registered} onChange={(e) => set("vat_registered", e.target.checked)} />
            I'm VAT-registered: add VAT to new documents by default
          </label>
          {f.vat_registered && (
            <Field label="Default VAT rate (%)" className="mt-4 max-w-[200px]">
              <input className={field} type="number" min={0} max={100} step="0.01" value={f.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value as unknown as number)} />
            </Field>
          )}
        </Section>

        <Section title="Numbering" hint="Numbers are given when you finalise, so deleted drafts never leave gaps. Raise the next number to continue from an older system.">
          <Grid>
            <Field label="Invoice prefix" hint={`Next: ${numberExample(f.invoice_prefix, f.next_invoice_seq)}`}><input className={field} {...text("invoice_prefix")} /></Field>
            <Field label="Next invoice number"><input className={field} type="number" min={1} value={f.next_invoice_seq} onChange={(e) => set("next_invoice_seq", e.target.value as unknown as number)} /></Field>
            <Field label="Quote prefix" hint={`Next: ${numberExample(f.quote_prefix, f.next_quote_seq)}`}><input className={field} {...text("quote_prefix")} /></Field>
            <Field label="Next quote number"><input className={field} type="number" min={1} value={f.next_quote_seq} onChange={(e) => set("next_quote_seq", e.target.value as unknown as number)} /></Field>
          </Grid>
        </Section>

        <Section title="Defaults for new documents" hint="Every new quote or invoice starts with these. You can still change them per document. Notes and terms support **bold**, ### headings and - bullet lists.">
          <Grid>
            <Field label="Invoice due after (days)"><input className={field} type="number" min={0} value={f.default_due_days} onChange={(e) => set("default_due_days", e.target.value as unknown as number)} /></Field>
            <Field label="Quote valid for (days)"><input className={field} type="number" min={0} value={f.default_valid_days} onChange={(e) => set("default_valid_days", e.target.value as unknown as number)} /></Field>
          </Grid>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={f.default_counts_as_income} onChange={(e) => set("default_counts_as_income", e.target.checked)} />
            <span>
              Invoice payments count as my income
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Split into your buckets and included in analytics. Turn this off per invoice for pass-through money like brokerage deals.
              </span>
            </span>
          </label>
          <div className="mt-4 space-y-4">
            <Field label="Quote payment terms"><textarea className={textarea} placeholder="50% deposit to start, balance on delivery." {...text("quote_payment_terms")} /></Field>
            <Field label="Quote notes"><textarea className={textarea} placeholder="Thank you for considering us for this project." {...text("quote_notes")} /></Field>
            <Field label="Quote terms of agreement"><textarea className={`${textarea} min-h-[160px]`} placeholder={"### 1. Scope of work\nWork outside this quote is quoted separately.\n\n### 2. Revisions\nTwo rounds of revisions per milestone."} {...text("quote_terms")} /></Field>
            <Field label="Invoice notes"><textarea className={textarea} placeholder="Thank you for your business." {...text("invoice_notes")} /></Field>
            <Field label="Invoice terms"><textarea className={textarea} placeholder="Payment due within 14 days." {...text("invoice_terms")} /></Field>
          </div>
          <Grid className="mt-4">
            <Field label="Signatory name" hint="Printed on the quote's acceptance block"><input className={field} {...text("signatory_name")} /></Field>
            <Field label="Signatory title"><input className={field} placeholder="Founder" {...text("signatory_title")} /></Field>
          </Grid>
          <Field label="Footer line" className="mt-4"><input className={field} placeholder="Brian AI Studio · Registered in Kenya" {...text("footer_text")} /></Field>
        </Section>

        <div className="sticky bottom-20 z-10 md:bottom-4">
          <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-lg transition hover:bg-primary-glow disabled:opacity-50 sm:w-auto sm:px-8">
            {saving ? "Saving…" : "Save business details"}
          </button>
        </div>
      </div>

      <aside className="hidden 2xl:block sticky top-6">
        <p className="mb-2 text-xs text-muted-foreground">Preview</p>
        <div className="overflow-hidden rounded-lg">
          <PaperFrame>
            <DocumentPaper
              kind="invoice" status="sent" number={`${f.invoice_prefix || "INV"}-${year}-0001`}
              doc={{
                title: "Company website", summary: null, deliverables: [], reference: null, timeline: null,
                payment_terms: null, notes: f.invoice_notes || null, terms: null, etims_number: null,
                issue_date: today, due_date: addDays(today, Number(f.default_due_days) || 0),
                discount_type: "amount", discount_value: 0, tax_rate: f.vat_registered ? Number(f.default_tax_rate) : 0,
                tax_label: "VAT", payment_link_url: null,
              }}
              items={SAMPLE_ITEMS}
              totals={sampleTotals}
              amountPaid={0}
              issuer={{ ...f, brand_color: normalizeHex(f.brand_color) ?? "#0f172a" }}
              client={{ name: "Jane Wanjiru", company: "Example Ltd", email: "jane@example.co.ke", phone: null, address: "Nairobi", kra_pin: null }}
            />
          </PaperFrame>
        </div>
      </aside>
    </div>
  );
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="glass rounded-2xl p-5 sm:p-6">
    <h2 className="text-base font-semibold">{title}</h2>
    {hint && <p className="mt-1 mb-4 text-sm text-muted-foreground">{hint}</p>}
    {!hint && <div className="mb-4" />}
    {children}
  </section>
);

const Grid = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>{children}</div>
);

const Field = ({
  label, hint, required, className = "", children,
}: { label: string; hint?: string; required?: boolean; className?: string; children: ReactNode }) => (
  <label className={`block ${className}`}>
    <span className="text-sm text-muted-foreground">{label}{required && <span className="text-primary"> *</span>}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </label>
);
