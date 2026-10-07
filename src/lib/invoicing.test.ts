import { describe, expect, it } from "vitest";
import {
  addDays, balanceDue, computeTotals, displayStatus, draftDefaults, formatDocDate,
  normalizeHex, readableOn, type BusinessProfile,
} from "./invoicing";

describe("computeTotals", () => {
  const items = [20000, 7000, 9500, 5000, 8000, 5500].map((unit_price) => ({ quantity: 1, unit_price }));

  it("applies a flat discount", () => {
    expect(computeTotals(items, "amount", 4000, 0)).toEqual({ subtotal: 55000, discount: 4000, tax: 0, total: 51000 });
  });

  it("caps a flat discount at the subtotal", () => {
    expect(computeTotals([{ quantity: 1, unit_price: 100 }], "amount", 500, 0).total).toBe(0);
  });

  it("applies a percent discount then tax on the discounted amount (matches the SQL)", () => {
    // Same case as the migration test: 3 × 333.33, 10% off, 16% VAT.
    expect(computeTotals([{ quantity: 3, unit_price: 333.33 }], "percent", 10, 16))
      .toEqual({ subtotal: 999.99, discount: 100, tax: 144, total: 1043.99 });
  });

  it("treats empty inputs as zero", () => {
    expect(computeTotals([], "amount", 0, 0).total).toBe(0);
  });
});

describe("displayStatus", () => {
  const base = { kind: "invoice" as const, status: "sent" as const, due_date: "2026-10-20", total: 51000, amount_paid: 0 };

  it("marks a sent invoice past its due date as overdue", () => {
    expect(displayStatus(base, "2026-10-21")).toBe("overdue");
    expect(displayStatus(base, "2026-10-20")).toBe("sent");
  });

  it("shows partial payment", () => {
    expect(displayStatus({ ...base, amount_paid: 20000 }, "2026-10-07")).toBe("partial");
  });

  it("expires a sent quote past its valid-until date", () => {
    expect(displayStatus({ ...base, kind: "quote" }, "2026-11-02")).toBe("expired");
  });

  it("passes stored terminal statuses through", () => {
    expect(displayStatus({ ...base, status: "paid" }, "2027-01-01")).toBe("paid");
  });
});

describe("dates", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
  });
  it("formats without a timezone shift", () => {
    expect(formatDocDate("2026-10-06")).toBe("6 Oct 2026");
  });
});

describe("brand color", () => {
  it("normalises hex input", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#0F172A")).toBe("#0f172a");
    expect(normalizeHex("blue")).toBeNull();
  });
  it("picks a readable text color", () => {
    expect(readableOn("#0f172a")).toBe("#ffffff");
    expect(readableOn("#fde047")).toBe("#0b0f19");
  });
});

describe("balanceDue / draftDefaults", () => {
  it("never goes negative", () => {
    expect(balanceDue({ total: 100, amount_paid: 150 })).toBe(0);
  });

  it("prefills from the business profile", () => {
    const bp = {
      default_due_days: 7, default_valid_days: 21, default_counts_as_income: false, vat_registered: true, default_tax_rate: 16,
      invoice_notes: "Thanks", invoice_terms: null, quote_notes: "Q", quote_terms: "T", quote_payment_terms: "50% upfront",
    } as BusinessProfile;
    expect(draftDefaults("invoice", bp, "2026-10-07")).toMatchObject({ due_date: "2026-10-14", notes: "Thanks", tax_rate: 16, payment_terms: null, counts_as_income: false });
    expect(draftDefaults("quote", bp, "2026-10-07")).toMatchObject({ due_date: "2026-10-28", terms: "T", payment_terms: "50% upfront" });
    expect(draftDefaults("invoice", null, "2026-10-07")).toMatchObject({ due_date: "2026-10-21", tax_rate: 0, counts_as_income: true });
  });
});
