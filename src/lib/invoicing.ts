// Quotes + invoices: types and the pure helpers the editor, list and
// renderer share. Money math mirrors `documents_compute_totals()` in
// supabase/migrations/20261007000000_invoicing.sql so the live preview of a
// draft shows exactly what Postgres will store.

export type DocumentKind = "quote" | "invoice";
export type DocumentStatus = "draft" | "sent" | "accepted" | "declined" | "paid" | "void";
export type DiscountType = "amount" | "percent";
export type PaymentMethod = "mpesa" | "bank" | "paystack" | "cash" | "other";

export interface BusinessProfile {
  user_id: string;
  legal_name: string | null;
  trading_name: string | null;
  tagline: string | null;
  kra_pin: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  logo_url: string | null;
  brand_color: string;
  header_style: "band" | "minimal";
  vat_registered: boolean;
  default_tax_rate: number;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  mpesa_paybill: string | null;
  mpesa_account: string | null;
  mpesa_till: string | null;
  mpesa_phone: string | null;
  payment_note: string | null;
  invoice_prefix: string;
  quote_prefix: string;
  next_invoice_seq: number;
  next_quote_seq: number;
  default_due_days: number;
  default_valid_days: number;
  /** New documents count as income (split into buckets) unless set otherwise. */
  default_counts_as_income: boolean;
  invoice_notes: string | null;
  invoice_terms: string | null;
  quote_notes: string | null;
  quote_terms: string | null;
  quote_payment_terms: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  footer_text: string | null;
}

/** The issuer fields a document renders. A finalised document carries a frozen copy. */
export type Issuer = Omit<
  BusinessProfile,
  | "user_id" | "next_invoice_seq" | "next_quote_seq" | "invoice_notes" | "invoice_terms"
  | "quote_notes" | "quote_terms" | "quote_payment_terms" | "default_counts_as_income"
>;

export interface Client {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  kra_pin: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

export type ClientInfo = Pick<Client, "name" | "company" | "email" | "phone" | "address" | "kra_pin">;

export interface SalesDocument {
  id: string;
  user_id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  number: string | null;
  client_id: string | null;
  client_snapshot: ClientInfo | null;
  issuer_snapshot: Issuer | null;
  title: string | null;
  summary: string | null;
  deliverables: string[];
  reference: string | null;
  timeline: string | null;
  payment_terms: string | null;
  notes: string | null;
  terms: string | null;
  etims_number: string | null;
  issue_date: string;
  due_date: string | null;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  tax_label: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  source_quote_id: string | null;
  public_token: string;
  payment_link_url: string | null;
  /** false = pass-through money (brokerage, a float): payments never reach the buckets. */
  counts_as_income: boolean;
  sent_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id?: string;
  position: number;
  description: string;
  details: string | null;
  quantity: number;
  unit_price: number;
}

export interface DocumentPayment {
  id: string;
  document_id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  transaction_id: string | null;
}

// ─── Labels ────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<DocumentKind, { one: string; many: string; title: string; path: string }> = {
  quote:   { one: "quote",   many: "Quotes",   title: "Quotation", path: "/quotes" },
  invoice: { one: "invoice", many: "Invoices", title: "Invoice",   path: "/invoices" },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  mpesa: "M-Pesa",
  bank: "Bank transfer",
  paystack: "Paystack",
  cash: "Cash",
  other: "Other",
};

// ─── Money ─────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineAmount = (i: Pick<DocumentItem, "quantity" | "unit_price">) =>
  round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0));

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function computeTotals(
  items: Pick<DocumentItem, "quantity" | "unit_price">[],
  discountType: DiscountType,
  discountValue: number,
  taxRate: number,
): Totals {
  const subtotal = round2(items.reduce((s, i) => s + lineAmount(i), 0));
  const dv = Math.max(0, Number(discountValue) || 0);
  const discount = discountType === "percent"
    ? round2(subtotal * Math.min(dv, 100) / 100)
    : Math.min(dv, subtotal);
  const tax = round2((subtotal - discount) * (Number(taxRate) || 0) / 100);
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

// ─── Status ────────────────────────────────────────────────────────────────

export type DisplayStatus =
  | "draft" | "sent" | "overdue" | "partial" | "paid" | "void"
  | "accepted" | "declined" | "expired";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  partial: "Partly paid",
  paid: "Paid",
  void: "Void",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** Today as "YYYY-MM-DD" in local time (matches `<input type="date">`). */
export function todayISODate(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return todayISODate(new Date(y, m - 1, d + days, 12));
}

/** The status a person cares about: stored status plus due-date and part-payment context. */
export function displayStatus(
  doc: Pick<SalesDocument, "kind" | "status" | "due_date" | "total" | "amount_paid">,
  today = todayISODate(),
): DisplayStatus {
  const pastDue = !!doc.due_date && doc.due_date < today;
  if (doc.kind === "invoice" && doc.status === "sent") {
    if (pastDue) return "overdue";
    if (Number(doc.amount_paid) > 0) return "partial";
    return "sent";
  }
  if (doc.kind === "quote" && doc.status === "sent" && pastDue) return "expired";
  return doc.status;
}

export const balanceDue = (doc: Pick<SalesDocument, "total" | "amount_paid">) =>
  Math.max(0, round2(Number(doc.total) - Number(doc.amount_paid)));

// ─── Dates ─────────────────────────────────────────────────────────────────

/** "6 Oct 2026" from "YYYY-MM-DD" without a UTC shift. */
export function formatDocDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Brand color ───────────────────────────────────────────────────────────

/** Normalise "#abc" / "abc" / "#AABBCC" to "#aabbcc"; null if not a hex color. */
export function normalizeHex(input: string | null | undefined): string | null {
  const m = (input ?? "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(m)) return "#" + m.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(m)) return "#" + m;
  return null;
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string): "#ffffff" | "#0b0f19" {
  const h = normalizeHex(hex) ?? "#0f172a";
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast vs white = 1.05 / (L + 0.05); vs near-black ≈ (L + 0.05) / 0.06
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.06 ? "#ffffff" : "#0b0f19";
}

// ─── Prefill ───────────────────────────────────────────────────────────────

/** Fields for a brand-new draft, taken from the user's Business settings. */
export function draftDefaults(kind: DocumentKind, bp: BusinessProfile | null, today = todayISODate()) {
  const days = kind === "invoice" ? bp?.default_due_days ?? 14 : bp?.default_valid_days ?? 30;
  return {
    kind,
    issue_date: today,
    due_date: addDays(today, days),
    notes: (kind === "invoice" ? bp?.invoice_notes : bp?.quote_notes) ?? null,
    terms: (kind === "invoice" ? bp?.invoice_terms : bp?.quote_terms) ?? null,
    payment_terms: kind === "quote" ? bp?.quote_payment_terms ?? null : null,
    tax_rate: bp?.vat_registered ? Number(bp.default_tax_rate) : 0,
    counts_as_income: bp?.default_counts_as_income ?? true,
  };
}

/** "{prefix}-{YYYY}-{0001}", the format finalise_document() assigns. */
export function formatDocNumber(prefix: string | null | undefined, issueDate: string, seq: number): string {
  const p = (prefix ?? "").trim();
  return `${p ? `${p}-` : ""}${issueDate.slice(0, 4)}-${String(Math.max(1, Math.floor(Number(seq) || 1))).padStart(4, "0")}`;
}

/** Business name shown on documents: trading name if set, else the legal name. */
export const issuerDisplayName = (i: Pick<Issuer, "legal_name" | "trading_name"> | null) =>
  i?.trading_name?.trim() || i?.legal_name?.trim() || "Your business";

export function hasPaymentDetails(i: Issuer | null): boolean {
  if (!i) return false;
  return !!(i.bank_account_number || i.mpesa_paybill || i.mpesa_till || i.mpesa_phone || i.payment_note);
}
