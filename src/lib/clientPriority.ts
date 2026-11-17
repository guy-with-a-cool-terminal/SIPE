// Client priority: who matters most (value) and who needs you today (attention).
//
// Everything is derived from finalised quotes, invoices and the payments recorded
// against them, so it needs no extra input. Pure functions; see clientPriority.test.ts.

import { formatKES } from "@/integrations/supabase/types";
import { balanceDue, formatDocDate, todayISODate, type Client, type DocumentPayment, type SalesDocument } from "./invoicing";

export type PriorityDoc = Pick<
  SalesDocument,
  | "id" | "kind" | "status" | "number" | "client_id" | "issue_date" | "due_date" | "total"
  | "amount_paid" | "paid_at" | "source_quote_id" | "counts_as_income" | "public_token" | "title"
>;
export type PriorityPayment = Pick<DocumentPayment, "document_id" | "amount" | "paid_at">;
export type PriorityClient = Pick<Client, "id" | "name" | "company" | "archived"> & { key_client?: boolean | null };

export type Tier = "top" | "regular" | "occasional" | "new";

export const TIER_LABEL: Record<Tier, string> = {
  top: "Top",
  regular: "Regular",
  occasional: "Occasional",
  new: "New",
};

export interface ClientStats {
  clientId: string;
  /** Payments received in the last 12 months that count as income. */
  earned12m: number;
  earnedAll: number;
  /** Share of all client income in the last 12 months, 0..1. */
  share12m: number;
  /** Unpaid balance on finalised invoices. */
  owed: number;
  overdue: number;
  maxDaysOverdue: number;
  /** Open quotes plus accepted quotes not yet invoiced. */
  pipeline: number;
  paidInvoices: number;
  paidOnTime: number;
  /** Average days paid after the due date (negative = early). Null until something is paid. */
  avgDaysLate: number | null;
  lastActivity: string | null;
  daysQuiet: number | null;
  tier: Tier;
  key: boolean;
  /** Up to three short, plain reasons for the client's standing. */
  reasons: string[];
}

/** Days from `a` to `b` (both "YYYY-MM-DD" or ISO), date part only, no timezone shift. */
export function daysBetween(a: string, b: string): number {
  const d = (s: string) => {
    const [y, m, day] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((d(b) - d(a)) / 86_400_000);
}

export const clientName = (c: Pick<Client, "name" | "company"> | undefined) =>
  c ? c.company?.trim() || c.name : "A client";

const TIER_RANK: Record<Tier, number> = { top: 3, regular: 2, occasional: 1, new: 0 };

export function computeClientStats(
  clients: PriorityClient[],
  docs: PriorityDoc[],
  payments: PriorityPayment[],
  today = todayISODate(),
): Map<string, ClientStats> {
  const live = docs.filter((d) => d.client_id && d.status !== "draft" && d.status !== "void");
  const docById = new Map(live.map((d) => [d.id, d]));
  const invoicedQuotes = new Set(
    docs.filter((d) => d.kind === "invoice" && d.status !== "void" && d.source_quote_id).map((d) => d.source_quote_id!),
  );

  const stats = new Map<string, ClientStats>();
  for (const c of clients) {
    stats.set(c.id, {
      clientId: c.id, earned12m: 0, earnedAll: 0, share12m: 0, owed: 0, overdue: 0, maxDaysOverdue: 0,
      pipeline: 0, paidInvoices: 0, paidOnTime: 0, avgDaysLate: null, lastActivity: null, daysQuiet: null,
      tier: "new", key: !!c.key_client, reasons: [],
    });
  }
  const touch = (s: ClientStats, date: string | null | undefined) => {
    if (date && (!s.lastActivity || date.slice(0, 10) > s.lastActivity)) s.lastActivity = date.slice(0, 10);
  };

  for (const p of payments) {
    const d = docById.get(p.document_id);
    const s = d && stats.get(d.client_id!);
    if (!d || !s) continue;
    touch(s, p.paid_at);
    if (d.kind !== "invoice" || !d.counts_as_income) continue;
    const amount = Number(p.amount);
    s.earnedAll += amount;
    if (daysBetween(p.paid_at, today) <= 365) s.earned12m += amount;
  }

  const lateness = new Map<string, number[]>();
  for (const d of live) {
    const s = stats.get(d.client_id!);
    if (!s) continue;
    touch(s, d.issue_date);
    if (d.kind === "invoice") {
      const bal = d.status === "sent" ? balanceDue(d) : 0;
      s.owed += bal;
      if (bal > 0 && d.due_date && d.due_date < today) {
        s.overdue += bal;
        s.maxDaysOverdue = Math.max(s.maxDaysOverdue, daysBetween(d.due_date, today));
      }
      if (d.status === "paid" && d.paid_at && d.due_date) {
        const late = daysBetween(d.due_date, d.paid_at);
        (lateness.get(s.clientId) ?? lateness.set(s.clientId, []).get(s.clientId)!).push(late);
      }
    } else if (d.status === "sent" && (!d.due_date || d.due_date >= today)) {
      s.pipeline += Number(d.total);
    } else if (d.status === "accepted" && !invoicedQuotes.has(d.id)) {
      s.pipeline += Number(d.total);
    }
  }

  for (const [id, lates] of lateness) {
    const s = stats.get(id)!;
    s.paidInvoices = lates.length;
    s.paidOnTime = lates.filter((l) => l <= 0).length;
    s.avgDaysLate = Math.round(lates.reduce((a, b) => a + b, 0) / lates.length);
  }

  // Tiers: the clients who make up the first 80% of the last year's income are Top,
  // the next 15% Regular, the rest Occasional. Never paid you: New.
  const total12m = [...stats.values()].reduce((a, s) => a + s.earned12m, 0);
  const ranked = [...stats.values()].filter((s) => s.earned12m > 0).sort((a, b) => b.earned12m - a.earned12m);
  let before = 0;
  for (const s of ranked) {
    s.share12m = s.earned12m / total12m;
    s.tier = before < 0.8 ? "top" : before < 0.95 ? "regular" : "occasional";
    before += s.share12m;
  }
  for (const s of stats.values()) {
    if (s.earned12m === 0 && s.earnedAll > 0) s.tier = "occasional";
    s.daysQuiet = s.lastActivity ? daysBetween(s.lastActivity, today) : null;
    s.reasons = reasonsFor(s);
  }
  return stats;
}

function reasonsFor(s: ClientStats): string[] {
  const r: string[] = [];
  if (s.share12m >= 0.1) r.push(`${Math.round(s.share12m * 100)}% of your income in the last 12 months`);
  if (s.overdue > 0) r.push(`${formatKES(s.overdue)} overdue`);
  if (s.paidInvoices >= 2 && s.avgDaysLate !== null) {
    r.push(s.avgDaysLate <= 2 ? `Pays on time (${s.paidOnTime} of ${s.paidInvoices})` : `Usually pays ${s.avgDaysLate} days late`); // > 2, always plural
  }
  if (s.tier === "new" && s.pipeline > 0) r.push(`${formatKES(s.pipeline)} quoted, not yet paid`);
  if (s.earnedAll > 0 && s.daysQuiet !== null && s.daysQuiet >= 60 && s.owed === 0 && s.pipeline === 0) {
    r.push(`No new work in ${s.daysQuiet} days`);
  }
  return r.slice(0, 3);
}

/** Key clients first, then tier, then what they paid you this year, then open work. */
export function compareByPriority(a: ClientStats, b: ClientStats): number {
  return (
    Number(b.key) - Number(a.key) ||
    TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
    b.earned12m - a.earned12m ||
    b.pipeline + b.owed - (a.pipeline + a.owed)
  );
}

// ─── Needs attention ───────────────────────────────────────────────────────

export type AttentionKind = "overdue" | "invoice_accepted" | "due_soon" | "quote_expiring" | "check_in";

export interface AttentionItem {
  kind: AttentionKind;
  clientId: string;
  doc: PriorityDoc | null;
  amount: number;
  title: string;
  detail: string;
}

// Lower comes first. Money already earned beats money still to be won.
const KIND_ORDER: Record<AttentionKind, number> = {
  overdue: 0, invoice_accepted: 1, due_soon: 2, quote_expiring: 3, check_in: 4,
};

export function attentionItems(
  clients: PriorityClient[],
  docs: PriorityDoc[],
  stats: Map<string, ClientStats>,
  today = todayISODate(),
): AttentionItem[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const invoicedQuotes = new Set(
    docs.filter((d) => d.kind === "invoice" && d.status !== "void" && d.source_quote_id).map((d) => d.source_quote_id!),
  );
  const items: AttentionItem[] = [];

  for (const d of docs) {
    const c = d.client_id ? byId.get(d.client_id) : undefined;
    if (!c || c.archived) continue;
    const name = clientName(c);
    if (d.kind === "invoice" && d.status === "sent") {
      const bal = balanceDue(d);
      if (bal <= 0 || !d.due_date) continue;
      const days = daysBetween(today, d.due_date);
      if (days < 0) {
        const late = -days;
        items.push({
          kind: "overdue", clientId: c.id, doc: d, amount: bal,
          title: `${name} is ${late} ${late === 1 ? "day" : "days"} late`,
          detail: `${d.number} · ${formatKES(bal)} unpaid`,
        });
      } else if (days <= 3) {
        items.push({
          kind: "due_soon", clientId: c.id, doc: d, amount: bal,
          title: `${name} pays ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
          detail: `${d.number} · ${formatKES(bal)} due ${formatDocDate(d.due_date)}`,
        });
      }
    } else if (d.kind === "quote" && d.status === "accepted" && !invoicedQuotes.has(d.id)) {
      items.push({
        kind: "invoice_accepted", clientId: c.id, doc: d, amount: Number(d.total),
        title: `Invoice ${name} for the accepted quote`,
        detail: `${d.number} · ${formatKES(Number(d.total))} accepted, not yet invoiced`,
      });
    } else if (d.kind === "quote" && d.status === "sent" && d.due_date) {
      const days = daysBetween(today, d.due_date);
      if (days >= 0 && days <= 7) {
        items.push({
          kind: "quote_expiring", clientId: c.id, doc: d, amount: Number(d.total),
          title: `Follow up with ${name}`,
          detail: `${d.number} · ${formatKES(Number(d.total))} quote ${days === 0 ? "expires today" : `expires in ${days} ${days === 1 ? "day" : "days"}`}`,
        });
      }
    }
  }

  for (const s of stats.values()) {
    const c = byId.get(s.clientId);
    if (!c || c.archived) continue;
    const valued = s.key || s.tier === "top";
    if (valued && s.earnedAll > 0 && (s.daysQuiet ?? 0) >= 60 && s.owed === 0 && s.pipeline === 0) {
      items.push({
        kind: "check_in", clientId: c.id, doc: null, amount: s.earned12m,
        title: `Check in with ${clientName(c)}`,
        detail: `No new work in ${s.daysQuiet} days · ${formatKES(s.earned12m)} paid in the last 12 months`,
      });
    }
  }

  // Within each kind, the clients worth most to you come first.
  const weight = (i: AttentionItem) => {
    const s = stats.get(i.clientId);
    const boost = !s ? 1 : s.key ? 2 : s.tier === "top" ? 1.5 : s.tier === "regular" ? 1.2 : 1;
    return i.amount * boost;
  };
  return items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || weight(b) - weight(a));
}

/** One client making up half or more of last year's income is a risk worth naming. */
export function concentration(stats: Map<string, ClientStats>): ClientStats | null {
  let top: ClientStats | null = null;
  let clientsWithIncome = 0;
  for (const s of stats.values()) {
    if (s.earned12m > 0) clientsWithIncome++;
    if (!top || s.share12m > top.share12m) top = s;
  }
  return top && clientsWithIncome >= 2 && top.share12m >= 0.5 ? top : null;
}

// ─── Reminders ─────────────────────────────────────────────────────────────

export function reminderText(opts: {
  kind: AttentionKind;
  contactName: string;
  number: string | null;
  amount: number;
  date: string | null;
  link: string | null;
  businessName: string;
}): string {
  const first = opts.contactName.trim().split(/\s+/)[0] || "there";
  const ref = opts.number ? `${opts.number} ` : "";
  const amount = formatKES(opts.amount);
  const date = formatDocDate(opts.date);
  const link = opts.link ? `\n\nYou can view and download it here: ${opts.link}` : "";
  const sign = `\n\nThank you,\n${opts.businessName}`;
  switch (opts.kind) {
    case "overdue":
      return `Hi ${first}, a quick reminder that invoice ${ref}for ${amount} was due on ${date} and is still open. Could you let me know when to expect payment?${link}${sign}`;
    case "due_soon":
      return `Hi ${first}, a friendly reminder that invoice ${ref}for ${amount} is due on ${date}.${link}${sign}`;
    case "quote_expiring":
      return `Hi ${first}, following up on quote ${ref}for ${amount}. It is valid until ${date}. Happy to answer any questions or adjust the scope.${link}${sign}`;
    case "check_in":
      return `Hi ${first}, it has been a while. How is everything going? If there is anything coming up that I can help with, I would be glad to.${sign}`;
    case "invoice_accepted":
      return `Hi ${first}, thank you for accepting quote ${ref}. I will send the invoice shortly.${sign}`;
  }
}

/** wa.me link. Kenyan numbers like 0712 345 678 or 712345678 become 254712345678. */
export function whatsappLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) digits = "254" + digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) digits = "254" + digits;
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
