// Client money that needs attention, for the weekly email and the daily
// client-reminders-batch. A server-side subset of src/lib/clientPriority.ts
// (overdue, due soon, accepted quotes not invoiced); keep the wording in step.

import { EMAIL, APP_URL } from "./email.ts";
import { formatKES } from "./kes.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface OpenInvoice {
  id: string;
  number: string | null;
  kind: "quote" | "invoice";
  status: string;
  client_id: string | null;
  client_snapshot: { name?: string; company?: string | null; email?: string | null } | null;
  due_date: string | null;
  total: number | string;
  amount_paid: number | string;
  public_token: string;
  source_quote_id: string | null;
}

export interface AttentionLine {
  kind: "overdue" | "due_soon" | "invoice_accepted";
  docId: string;
  number: string | null;
  client: string;
  amount: number;
  /** Days late (overdue) or days left (due soon). */
  days: number;
}

/** Calendar days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  const d = (s: string) => {
    const [y, m, day] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((d(b) - d(a)) / 86_400_000);
}

export const clientLabel = (c: { name?: string; company?: string | null } | null | undefined) =>
  c?.company?.trim() || c?.name || "A client";

/** Finalised quotes and invoices for one user, with client names resolved. */
export async function loadOpenDocuments(db: Db, userId: string): Promise<OpenInvoice[]> {
  const { data, error } = await db
    .from("documents")
    .select("id,number,kind,status,client_id,client_snapshot,due_date,total,amount_paid,public_token,source_quote_id")
    .eq("user_id", userId)
    .in("status", ["sent", "accepted"]);
  if (error) throw error;
  return (data ?? []) as OpenInvoice[];
}

export async function clientAttention(db: Db, userId: string, today: string): Promise<AttentionLine[]> {
  const docs = await loadOpenDocuments(db, userId);
  const { data: invoiced } = await db
    .from("documents").select("source_quote_id").eq("user_id", userId).eq("kind", "invoice")
    .neq("status", "void").not("source_quote_id", "is", null);
  const done = new Set((invoiced ?? []).map((r: { source_quote_id: string }) => r.source_quote_id));

  const lines: AttentionLine[] = [];
  for (const d of docs) {
    const client = clientLabel(d.client_snapshot);
    if (d.kind === "invoice" && d.status === "sent" && d.due_date) {
      const bal = Math.max(0, Number(d.total) - Number(d.amount_paid));
      if (bal <= 0) continue;
      const days = daysBetween(today, d.due_date);
      if (days < 0) lines.push({ kind: "overdue", docId: d.id, number: d.number, client, amount: bal, days: -days });
      else if (days <= 3) lines.push({ kind: "due_soon", docId: d.id, number: d.number, client, amount: bal, days });
    } else if (d.kind === "quote" && d.status === "accepted" && !done.has(d.id)) {
      lines.push({ kind: "invoice_accepted", docId: d.id, number: d.number, client, amount: Number(d.total), days: 0 });
    }
  }
  const order = { overdue: 0, invoice_accepted: 1, due_soon: 2 };
  return lines.sort((a, b) => order[a.kind] - order[b.kind] || b.amount - a.amount);
}

/** "Clients" section for the weekly email. Empty string when nothing needs attention. */
export function clientAttentionHtml(lines: AttentionLine[]): string {
  if (!lines.length) return "";
  const text = (l: AttentionLine) =>
    l.kind === "overdue" ? `${l.client} is ${l.days} ${l.days === 1 ? "day" : "days"} late`
    : l.kind === "due_soon" ? `${l.client} pays ${l.days === 0 ? "today" : l.days === 1 ? "tomorrow" : `in ${l.days} days`}`
    : `Invoice ${l.client} for the accepted quote`;
  const rows = lines.slice(0, 5).map((l) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border}">${text(l)}<br><span style="font-size:12px;color:${EMAIL.textDim}">${l.number ?? ""}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;${l.kind === "overdue" ? `color:${EMAIL.bad}` : ""}">${formatKES(l.amount)}</td>
      </tr>`).join("");
  const more = lines.length > 5 ? `<p style="margin:8px 0 0;font-size:12px;color:${EMAIL.textDim}">and ${lines.length - 5} more</p>` : "";
  return `
    <div style="margin-top:24px">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:${EMAIL.text}">Clients who need you</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:${EMAIL.text}">${rows}</table>
      ${more}
      <p style="margin:12px 0 0;font-size:13px"><a href="${APP_URL}/clients" style="color:${EMAIL.brand}">Open Clients to send reminders</a></p>
    </div>`;
}
