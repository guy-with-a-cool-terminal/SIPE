import { describe, expect, it } from "vitest";
import {
  attentionItems, compareByPriority, computeClientStats, concentration, daysBetween, reminderText, whatsappLink,
  type PriorityClient, type PriorityDoc, type PriorityPayment,
} from "./clientPriority";

const TODAY = "2026-11-17";
const client = (id: string, extra: Partial<PriorityClient> = {}): PriorityClient =>
  ({ id, name: `Contact ${id}`, company: `Co ${id}`, archived: false, ...extra });
let n = 0;
const doc = (d: Partial<PriorityDoc>): PriorityDoc => ({
  id: `d${++n}`, kind: "invoice", status: "sent", number: `INV-${n}`, client_id: "a", issue_date: "2026-10-01",
  due_date: "2026-10-15", total: 1000, amount_paid: 0, paid_at: null, source_quote_id: null,
  counts_as_income: true, public_token: "t", title: null, ...d,
});
const pay = (document_id: string, amount: number, paid_at: string): PriorityPayment => ({ document_id, amount, paid_at });

describe("daysBetween", () => {
  it("counts calendar days, ignoring time", () => {
    expect(daysBetween("2026-11-10", "2026-11-17T23:00:00Z")).toBe(7);
    expect(daysBetween("2026-11-17", "2026-11-10")).toBe(-7);
  });
});

describe("computeClientStats", () => {
  const clients = [client("a"), client("b"), client("c"), client("d")];
  const paidA = doc({ client_id: "a", status: "paid", total: 80000, amount_paid: 80000, due_date: "2026-09-10", paid_at: "2026-09-08" });
  const paidA2 = doc({ client_id: "a", status: "paid", total: 20000, amount_paid: 20000, due_date: "2026-10-01", paid_at: "2026-10-01" });
  const paidB = doc({ client_id: "b", status: "paid", total: 15000, amount_paid: 15000, due_date: "2026-08-01", paid_at: "2026-08-21" });
  const paidC = doc({ client_id: "c", status: "paid", total: 5000, amount_paid: 5000, due_date: "2026-08-01", paid_at: "2026-08-01" });
  const overdueB = doc({ client_id: "b", total: 30000, amount_paid: 10000, due_date: "2026-11-07" });
  const passThrough = doc({ client_id: "c", status: "paid", total: 900000, amount_paid: 900000, counts_as_income: false, paid_at: "2026-11-01" });
  const quoteD = doc({ client_id: "d", kind: "quote", status: "sent", total: 40000, due_date: "2026-11-20" });
  const docs = [paidA, paidA2, paidB, paidC, overdueB, passThrough, quoteD];
  const payments = [
    pay(paidA.id, 80000, "2026-09-08"), pay(paidA2.id, 20000, "2026-10-01"), pay(paidB.id, 15000, "2026-08-21"),
    pay(paidC.id, 5000, "2026-08-01"), pay(overdueB.id, 10000, "2026-11-01"), pay(passThrough.id, 900000, "2026-11-01"),
  ];
  const stats = computeClientStats(clients, docs, payments, TODAY);

  it("adds up income per client and leaves pass-through money out", () => {
    expect(stats.get("a")!.earned12m).toBe(100000);
    expect(stats.get("b")!.earned12m).toBe(25000);
    expect(stats.get("c")!.earned12m).toBe(5000);
  });

  it("splits clients into tiers by the 80/20 rule", () => {
    // a = 76.9% on its own, so b is needed to reach 80%: both Top. c is the last 3.8%.
    expect(stats.get("a")!.tier).toBe("top");
    expect(stats.get("b")!.tier).toBe("top");
    expect(stats.get("c")!.tier).toBe("occasional");
    expect(stats.get("d")!.tier).toBe("new");
  });

  it("tracks what is owed, overdue and in the pipeline", () => {
    const b = stats.get("b")!;
    expect(b.owed).toBe(20000);
    expect(b.overdue).toBe(20000);
    expect(b.maxDaysOverdue).toBe(10);
    expect(stats.get("d")!.pipeline).toBe(40000);
  });

  it("measures payment habits", () => {
    expect(stats.get("a")!.avgDaysLate).toBe(-1);
    expect(stats.get("a")!.reasons).toContain("Pays on time (2 of 2)");
    expect(stats.get("b")!.avgDaysLate).toBe(20);
  });

  it("orders key clients first, then by value", () => {
    const keyed = computeClientStats([...clients.slice(0, 3), client("d", { key_client: true })], docs, payments, TODAY);
    const order = [...keyed.values()].sort(compareByPriority).map((s) => s.clientId);
    expect(order).toEqual(["d", "a", "b", "c"]);
  });

  it("flags one client earning half or more as concentration", () => {
    expect(concentration(stats)?.clientId).toBe("a");
  });
});

describe("attentionItems", () => {
  const clients = [client("big"), client("small"), client("quiet")];
  const overdueSmall = doc({ client_id: "small", total: 50000, due_date: "2026-11-01" });
  const overdueBig = doc({ client_id: "big", total: 30000, due_date: "2026-11-10" });
  const dueSoon = doc({ client_id: "big", total: 9000, due_date: "2026-11-19" });
  const accepted = doc({ client_id: "small", kind: "quote", status: "accepted", total: 12000 });
  const invoicedQuote = doc({ client_id: "small", kind: "quote", status: "accepted", total: 7000 });
  const fromQuote = doc({ client_id: "small", status: "draft", source_quote_id: invoicedQuote.id });
  const expiring = doc({ client_id: "big", kind: "quote", status: "sent", total: 20000, due_date: "2026-11-22" });
  const oldPaid = doc({ client_id: "quiet", status: "paid", total: 200000, amount_paid: 200000, issue_date: "2026-07-01", due_date: "2026-07-15", paid_at: "2026-07-10" });
  const bigPaid = doc({ client_id: "big", status: "paid", total: 100000, amount_paid: 100000, issue_date: "2026-11-01", paid_at: "2026-11-02" });
  const docs = [overdueSmall, overdueBig, dueSoon, accepted, invoicedQuote, fromQuote, expiring, oldPaid, bigPaid];
  const payments = [pay(oldPaid.id, 200000, "2026-07-10"), pay(bigPaid.id, 100000, "2026-11-02")];
  const stats = computeClientStats(clients, docs, payments, TODAY);
  const items = attentionItems(clients, docs, stats, TODAY);

  it("orders by kind, then by what the client is worth", () => {
    expect(items.map((i) => i.kind)).toEqual(["overdue", "overdue", "invoice_accepted", "due_soon", "quote_expiring", "check_in"]);
    // Within a kind, amount × client weight: small's 50,000 (new, ×1) beats big's 30,000 (top, ×1.5 = 45,000).
    expect(items[0].clientId).toBe("small");
    expect(items[1].clientId).toBe("big");
  });

  it("skips accepted quotes that already have an invoice", () => {
    expect(items.filter((i) => i.kind === "invoice_accepted")).toHaveLength(1);
  });

  it("writes plain titles", () => {
    expect(items[0].title).toBe("Co small is 16 days late");
    expect(items.find((i) => i.kind === "due_soon")!.title).toBe("Co big pays in 2 days");
    expect(items.find((i) => i.kind === "check_in")!.title).toBe("Check in with Co quiet");
  });

  it("ignores archived clients", () => {
    const archived = clients.map((c) => (c.id === "small" ? { ...c, archived: true } : c));
    expect(attentionItems(archived, docs, stats, TODAY).some((i) => i.clientId === "small")).toBe(false);
  });
});

describe("reminders", () => {
  it("writes a reminder with the share link", () => {
    const t = reminderText({ kind: "overdue", contactName: "Grace Achieng", number: "INV-2026-0002", amount: 45000, date: "2026-11-04", link: "https://x/d/1", businessName: "Brian AI Studio" });
    const plain = t.replace(/\u00a0/g, " ");
    expect(t).toContain("Hi Grace,");
    expect(plain).toContain("INV-2026-0002 for Ksh 45,000.00 was due on 4 Nov 2026");
    expect(t).toContain("https://x/d/1");
    expect(t).not.toContain("—");
  });

  it("builds WhatsApp links for Kenyan numbers", () => {
    expect(whatsappLink("0712 345 678", "hi")).toBe("https://wa.me/254712345678?text=hi");
    expect(whatsappLink("+254 722 000 111", "a b")).toBe("https://wa.me/254722000111?text=a%20b");
    expect(whatsappLink("712345678", "x")).toBe("https://wa.me/254712345678?text=x");
    expect(whatsappLink("123", "x")).toBeNull();
  });
});
