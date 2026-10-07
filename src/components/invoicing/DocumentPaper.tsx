import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatKES } from "@/integrations/supabase/types";
import { renderMarkdown } from "@/lib/markdown";
import {
  KIND_LABEL, PAYMENT_METHOD_LABEL, formatDocDate, hasPaymentDetails, issuerDisplayName,
  normalizeHex, readableOn,
  type ClientInfo, type DisplayStatus, type DocumentItem, type DocumentKind, type DocumentPayment,
  type Issuer, type SalesDocument, type Totals,
} from "@/lib/invoicing";
import { lineAmount } from "@/lib/invoicing";
import { cn } from "@/lib/utils";

/*
 * The printable quote / invoice. One renderer for the editor preview, the
 * detail page, print-to-PDF and the public /d/:token link.
 *
 * This is a paper document, not app UI: it is always light, sized to A4
 * (794 × 1123 CSS px at 96 dpi) and coloured by the user's brand colour, so it
 * deliberately does not use the app's dark theme tokens. The few fixed colours
 * it needs live in PAPER below.
 */

const PAPER = {
  ink: "#0f172a",
  muted: "#64748b",
  hairline: "#e2e8f0",
  wash: "#f8fafc",
  paid: "#15803d",
  void: "#b91c1c",
  draft: "#94a3b8",
};

export type PaperDoc = Pick<
  SalesDocument,
  | "title" | "summary" | "deliverables" | "reference" | "timeline" | "payment_terms" | "notes"
  | "terms" | "etims_number" | "issue_date" | "due_date" | "discount_type" | "discount_value"
  | "tax_rate" | "tax_label" | "payment_link_url"
>;

interface Props {
  kind: DocumentKind;
  status: DisplayStatus;
  number: string | null;
  doc: PaperDoc;
  items: DocumentItem[];
  totals: Totals;
  amountPaid: number;
  issuer: Issuer | null;
  client: ClientInfo | null;
  payments?: DocumentPayment[];
  /** Number of the quote this invoice came from, if any. */
  quoteNumber?: string | null;
}

export const DocumentPaper = ({
  kind, status, number, doc, items, totals, amountPaid, issuer, client, payments = [], quoteNumber,
}: Props) => {
  const brand = normalizeHex(issuer?.brand_color) ?? PAPER.ink;
  const onBrand = readableOn(brand);
  const band = (issuer?.header_style ?? "band") === "band";
  const isInvoice = kind === "invoice";
  const title = KIND_LABEL[kind].title;
  const name = issuerDisplayName(issuer);
  const balance = Math.max(0, totals.total - amountPaid);
  const deliverables = (doc.deliverables ?? []).filter((d) => d.trim());
  const showPay = isInvoice && status !== "void" && status !== "paid" && (hasPaymentDetails(issuer) || !!doc.payment_link_url);

  const stamp =
    status === "paid" ? { text: "Paid", color: PAPER.paid } :
    status === "void" ? { text: "Void", color: PAPER.void } :
    status === "draft" ? { text: "Draft", color: PAPER.draft } :
    status === "accepted" ? { text: "Accepted", color: PAPER.paid } : null;

  return (
    <article
      data-paper
      className="relative bg-white font-sans antialiased [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ width: 794, minHeight: 1123, color: PAPER.ink, fontSize: 12.5, lineHeight: 1.5 }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-start justify-between gap-8 px-12"
        style={band
          ? { background: brand, color: onBrand, paddingTop: 40, paddingBottom: 36 }
          : { paddingTop: 44, paddingBottom: 24, borderBottom: `3px solid ${brand}` }}
      >
        <div className="min-w-0">
          {issuer?.logo_url ? (
            <img src={issuer.logo_url} alt={name} crossOrigin="anonymous" style={{ maxHeight: 56, maxWidth: 240 }} className="object-contain object-left" />
          ) : (
            <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{name}</p>
          )}
          {issuer?.tagline && (
            <p style={{ fontSize: 11.5, marginTop: 8, opacity: band ? 0.8 : 1, color: band ? undefined : PAPER.muted }}>
              {issuer.tagline}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1, textTransform: "uppercase", color: band ? onBrand : brand }}>
            {title}
          </h1>
          <p style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{number ?? "Not yet numbered"}</p>
        </div>
      </header>

      <div className="px-12" style={{ paddingTop: 32, paddingBottom: 40 }}>
        {/* ── Parties + dates ── */}
        <section className="grid gap-6" style={{ gridTemplateColumns: "1.1fr 1.1fr 0.8fr" }}>
          <Block label="From" brand={brand}>
            <p style={{ fontWeight: 600 }}>{issuer?.legal_name || name}</p>
            {issuer?.trading_name && issuer.legal_name && issuer.trading_name !== issuer.legal_name && (
              <p style={{ color: PAPER.muted }}>Trading as {issuer.trading_name}</p>
            )}
            <Lines text={issuer?.address} />
            {issuer?.email && <p>{issuer.email}</p>}
            {issuer?.phone && <p>{issuer.phone}</p>}
            {issuer?.website && <p>{issuer.website}</p>}
            {issuer?.kra_pin && <p style={{ marginTop: 4 }}><span style={{ color: PAPER.muted }}>KRA PIN </span>{issuer.kra_pin}</p>}
          </Block>

          <Block label={isInvoice ? "Bill to" : "Prepared for"} brand={brand}>
            {client ? (
              <>
                <p style={{ fontWeight: 600 }}>{client.name}</p>
                {client.company && client.company !== client.name && <p>{client.company}</p>}
                <Lines text={client.address} />
                {client.email && <p>{client.email}</p>}
                {client.phone && <p>{client.phone}</p>}
                {client.kra_pin && <p style={{ marginTop: 4 }}><span style={{ color: PAPER.muted }}>KRA PIN </span>{client.kra_pin}</p>}
              </>
            ) : (
              <p style={{ color: PAPER.muted }}>No client selected</p>
            )}
          </Block>

          <div className="text-right space-y-2.5">
            <Meta label={isInvoice ? "Issued" : "Date"} value={formatDocDate(doc.issue_date)} />
            {doc.due_date && <Meta label={isInvoice ? "Due" : "Valid until"} value={formatDocDate(doc.due_date)} strong={isInvoice} />}
            {doc.reference && <Meta label="Reference" value={doc.reference} />}
            {quoteNumber && quoteNumber !== doc.reference && <Meta label="Quote" value={quoteNumber} />}
            {isInvoice && doc.etims_number && <Meta label="eTIMS invoice" value={doc.etims_number} />}
          </div>
        </section>

        {/* ── Project ── */}
        {(doc.title || doc.summary) && (
          <section style={{ marginTop: 32 }}>
            {doc.title && <Heading brand={brand}>{doc.title}</Heading>}
            {doc.summary && <p style={{ color: "#334155", whiteSpace: "pre-line" }}>{doc.summary}</p>}
          </section>
        )}

        {deliverables.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <Heading brand={brand} small>{isInvoice ? "Delivered" : "Features & deliverables"}</Heading>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1">
              {deliverables.map((d, i) => (
                <li key={i} className="flex gap-2.5 break-inside-avoid">
                  <span className="mt-[7px] size-1.5 flex-shrink-0 rounded-full" style={{ background: brand }} />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Line items ── */}
        <section style={{ marginTop: 32 }}>
          <table className="w-full border-collapse" style={{ fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: brand, color: onBrand }}>
                <th className="text-left font-semibold" style={{ padding: "10px 12px", width: 36 }}>#</th>
                <th className="text-left font-semibold" style={{ padding: "10px 12px" }}>Description</th>
                <th className="text-right font-semibold" style={{ padding: "10px 12px", width: 56 }}>Qty</th>
                <th className="text-right font-semibold" style={{ padding: "10px 12px", width: 128 }}>Unit price</th>
                <th className="text-right font-semibold" style={{ padding: "10px 12px", width: 136 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "18px 12px", color: PAPER.muted, borderBottom: `1px solid ${PAPER.hairline}` }}>No line items yet</td></tr>
              )}
              {items.map((it, i) => (
                <tr key={it.id ?? i} className="break-inside-avoid" style={{ borderBottom: `1px solid ${PAPER.hairline}` }}>
                  <td className="align-top tabular-nums" style={{ padding: "11px 12px", color: PAPER.muted }}>{i + 1}</td>
                  <td className="align-top" style={{ padding: "11px 12px" }}>
                    <p style={{ fontWeight: 500 }}>{it.description || <span style={{ color: PAPER.muted }}>Untitled item</span>}</p>
                    {it.details && <p style={{ color: PAPER.muted, fontSize: 11.5, marginTop: 2, whiteSpace: "pre-line" }}>{it.details}</p>}
                  </td>
                  <td className="align-top text-right tabular-nums" style={{ padding: "11px 12px" }}>{Number(it.quantity)}</td>
                  <td className="align-top text-right tabular-nums whitespace-nowrap" style={{ padding: "11px 12px" }}>{formatKES(Number(it.unit_price))}</td>
                  <td className="align-top text-right tabular-nums whitespace-nowrap" style={{ padding: "11px 12px", fontWeight: 600 }}>{formatKES(lineAmount(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Totals ── */}
          <div className="relative flex justify-end break-inside-avoid" style={{ marginTop: 16 }}>
            {stamp && (
              <div
                className="absolute left-4 top-2 select-none"
                style={{
                  transform: "rotate(-8deg)",
                  border: `3px solid ${stamp.color}`,
                  color: stamp.color,
                  borderRadius: 8,
                  padding: "6px 18px",
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                {stamp.text}
                {status === "paid" && amountPaid > 0 && (
                  <span className="block text-center" style={{ fontSize: 10, letterSpacing: "0.08em", fontWeight: 700 }}>
                    {formatKES(amountPaid)}
                  </span>
                )}
              </div>
            )}
            <dl className="tabular-nums" style={{ width: 300 }}>
              <Row label="Subtotal" value={formatKES(totals.subtotal)} />
              {totals.discount > 0 && (
                <Row
                  label={doc.discount_type === "percent" ? `Discount (${Number(doc.discount_value)}%)` : "Discount"}
                  value={`− ${formatKES(totals.discount)}`}
                />
              )}
              {Number(doc.tax_rate) > 0 && (
                <Row label={`${doc.tax_label || "VAT"} (${Number(doc.tax_rate)}%)`} value={formatKES(totals.tax)} />
              )}
              <div className="flex justify-between items-baseline" style={{ borderTop: `1.5px solid ${PAPER.ink}`, marginTop: 6, paddingTop: 8 }}>
                <dt style={{ fontWeight: 700, fontSize: 14 }}>Total</dt>
                <dd style={{ fontWeight: 800, fontSize: 16 }}>{formatKES(totals.total)}</dd>
              </div>
              {isInvoice && amountPaid > 0 && (
                <>
                  <Row label="Amount paid" value={`− ${formatKES(amountPaid)}`} />
                  <div
                    className="flex justify-between items-baseline"
                    style={{ background: brand, color: onBrand, marginTop: 8, padding: "9px 12px", borderRadius: 6 }}
                  >
                    <dt style={{ fontWeight: 700 }}>Balance due</dt>
                    <dd style={{ fontWeight: 800, fontSize: 15 }}>{formatKES(balance)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </section>

        {/* ── How to pay + payments received ── */}
        {(showPay || payments.length > 0) && (
          <section className="grid grid-cols-2 gap-8 break-inside-avoid" style={{ marginTop: 32 }}>
            {showPay ? <PaymentDetails issuer={issuer} brand={brand} payLink={doc.payment_link_url} reference={number} /> : <div />}
            {payments.length > 0 && (
              <div>
                <Label brand={brand}>Payments received</Label>
                <table className="w-full tabular-nums" style={{ fontSize: 11.5 }}>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${PAPER.hairline}` }}>
                        <td style={{ padding: "5px 0" }}>{formatDocDate(p.paid_at)}</td>
                        <td style={{ padding: "5px 8px", color: PAPER.muted }}>
                          {PAYMENT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                        </td>
                        <td className="text-right" style={{ padding: "5px 0", fontWeight: 600 }}>{formatKES(Number(p.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Text sections ── */}
        {doc.timeline && <TextSection title="Timeline" brand={brand} text={doc.timeline} />}
        {doc.payment_terms && <TextSection title="Payment terms" brand={brand} text={doc.payment_terms} />}
        {doc.notes && <TextSection title="Notes" brand={brand} text={doc.notes} />}
        {doc.terms && <TextSection title={isInvoice ? "Terms" : "Terms of agreement"} brand={brand} text={doc.terms} />}

        {/* ── Acceptance (quotes) ── */}
        {!isInvoice && (
          <section className="grid grid-cols-2 gap-12 break-inside-avoid" style={{ marginTop: 40 }}>
            <Signature
              heading={`For ${issuer?.legal_name || name}`}
              signed={issuer?.signatory_name}
              lines={[issuer?.signatory_name, issuer?.signatory_title].filter(Boolean) as string[]}
              date={formatDocDate(doc.issue_date)}
            />
            <Signature
              heading={`For ${client?.company || client?.name || "the client"}`}
              lines={["Name & signature"]}
              date=""
            />
          </section>
        )}

        {/* ── Footer ── */}
        <footer
          className="flex items-start justify-between gap-6 break-inside-avoid"
          style={{ marginTop: 44, paddingTop: 12, borderTop: `2px solid ${brand}`, fontSize: 10.5, color: PAPER.muted }}
        >
          <p>{[issuer?.email, issuer?.phone, issuer?.website].filter(Boolean).join("  ·  ")}</p>
          <p className="text-right" style={{ maxWidth: 360 }}>{issuer?.footer_text || issuer?.legal_name || name}</p>
        </footer>
      </div>
    </article>
  );
};

// ─── pieces ────────────────────────────────────────────────────────────────

const Label = ({ children, brand }: { children: ReactNode; brand: string }) => (
  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: brand, marginBottom: 6 }}>
    {children}
  </p>
);

const Block = ({ label, brand, children }: { label: string; brand: string; children: ReactNode }) => (
  <div className="min-w-0 break-words">
    <Label brand={brand}>{label}</Label>
    {children}
  </div>
);

const Meta = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div>
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: PAPER.muted }}>{label}</p>
    <p style={{ fontWeight: strong ? 700 : 600 }}>{value}</p>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between" style={{ padding: "3px 0" }}>
    <dt style={{ color: PAPER.muted }}>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const Lines = ({ text }: { text: string | null | undefined }) =>
  text ? <p style={{ whiteSpace: "pre-line" }}>{text}</p> : null;

const Heading = ({ children, brand, small }: { children: ReactNode; brand: string; small?: boolean }) => (
  <h2 style={{ fontSize: small ? 12 : 15, fontWeight: 700, marginBottom: 8, textTransform: small ? "uppercase" : undefined, letterSpacing: small ? "0.06em" : "-0.01em" }}>
    {children}
    <span className="block" style={{ width: 32, height: 2, background: brand, marginTop: 5 }} />
  </h2>
);

const paperMd =
  "[&_h2]:text-[12.5px] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 " +
  "[&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-0.5 " +
  "[&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-0.5 " +
  "[&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-0.5 [&_a]:underline [&_strong]:font-semibold " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const TextSection = ({ title, brand, text }: { title: string; brand: string; text: string }) => (
  <section style={{ marginTop: 26 }}>
    <Heading brand={brand} small>{title}</Heading>
    <div
      className={cn(paperMd)}
      style={{ color: "#334155", fontSize: 11.5 }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  </section>
);

const PaymentDetails = ({
  issuer, brand, payLink, reference,
}: { issuer: Issuer | null; brand: string; payLink: string | null; reference: string | null }) => {
  const kv = (k: string, v: string | null | undefined) =>
    v ? <div className="flex gap-2"><span style={{ color: PAPER.muted, minWidth: 92 }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span></div> : null;
  return (
    <div className="space-y-3" style={{ background: PAPER.wash, border: `1px solid ${PAPER.hairline}`, borderRadius: 8, padding: 14 }}>
      <Label brand={brand}>How to pay</Label>
      {issuer?.bank_account_number && (
        <div style={{ fontSize: 11.5 }}>
          <p style={{ fontWeight: 600, marginBottom: 2 }}>Bank transfer</p>
          {kv("Bank", [issuer.bank_name, issuer.bank_branch].filter(Boolean).join(", "))}
          {kv("Account name", issuer.bank_account_name)}
          {kv("Account no.", issuer.bank_account_number)}
          {kv("SWIFT", issuer.bank_swift)}
        </div>
      )}
      {(issuer?.mpesa_paybill || issuer?.mpesa_till || issuer?.mpesa_phone) && (
        <div style={{ fontSize: 11.5 }}>
          <p style={{ fontWeight: 600, marginBottom: 2 }}>M-Pesa</p>
          {issuer.mpesa_paybill && kv("Paybill", issuer.mpesa_paybill)}
          {issuer.mpesa_paybill && kv("Account", issuer.mpesa_account || reference)}
          {kv("Till", issuer.mpesa_till)}
          {kv("Send money", issuer.mpesa_phone)}
        </div>
      )}
      {payLink && (
        <p style={{ fontSize: 11.5 }}>
          <span style={{ fontWeight: 600 }}>Pay online: </span>
          <a href={payLink} style={{ color: brand, textDecoration: "underline", wordBreak: "break-all" }}>{payLink}</a>
        </p>
      )}
      {issuer?.payment_note && <p style={{ fontSize: 11, color: PAPER.muted, whiteSpace: "pre-line" }}>{issuer.payment_note}</p>}
    </div>
  );
};

const Signature = ({ heading, signed, lines, date }: { heading: string; signed?: string | null; lines: string[]; date: string }) => (
  <div>
    <div style={{ height: 44, borderBottom: `1px solid ${PAPER.ink}`, display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
      {signed && <span style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive", fontSize: 24, lineHeight: 1 }}>{signed}</span>}
    </div>
    <p style={{ fontWeight: 600, marginTop: 6 }}>{heading}</p>
    {lines.map((l, i) => <p key={i} style={{ color: PAPER.muted }}>{l}</p>)}
    <p style={{ color: PAPER.muted }}>Date: {date}</p>
  </div>
);

// ─── Fit-to-width frame for screens narrower than A4 ──────────────────────

/**
 * Scales the 794px paper down to fit its container on screen. In print the
 * transform is removed so the browser lays it out at true A4.
 */
export const PaperFrame = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const s = Math.min(1, o.clientWidth / 794);
      setScale(s);
      setHeight(i.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={cn("w-full print:!h-auto", className)} style={{ height, ...style }}>
      <div
        ref={inner}
        data-paper-frame
        className="origin-top-left shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] print:!transform-none print:shadow-none"
        style={{ width: 794, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
};
