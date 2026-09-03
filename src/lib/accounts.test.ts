import { describe, it, expect } from "vitest";
import { reconcileDiff, isStale, groupByKind, KIND_META } from "@/lib/accounts";
import type { AccountKind } from "@/integrations/supabase/types";

describe("reconcileDiff", () => {
  it("is positive when accounts hold more than the buckets", () => {
    expect(reconcileDiff(10_000, 9_000)).toBe(1_000);
  });
  it("is negative when the buckets account for more than the accounts", () => {
    expect(reconcileDiff(9_000, 10_000)).toBe(-1_000);
  });
  it("rounds to 2dp", () => {
    expect(reconcileDiff(100.014, 0)).toBe(100.01);
  });
});

describe("isStale", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  const base = { kind: "bank" as AccountKind, provider_slug: null, last_synced_at: null };

  it("is false for cash / mpesa / other regardless of activity", () => {
    expect(isStale({ ...base, kind: "cash" }, null, now)).toBe(false);
    expect(isStale({ ...base, kind: "mpesa" }, null, now)).toBe(false);
    expect(isStale({ ...base, kind: "other" }, null, now)).toBe(false);
  });

  it("is false when a provider sync is configured", () => {
    expect(isStale({ ...base, provider_slug: "lexinon" }, null, now)).toBe(false);
  });

  it("is true for a platform/bank account with no sync and no recent activity", () => {
    expect(isStale({ ...base, kind: "platform" }, "2026-01-01T00:00:00Z", now)).toBe(true);
    expect(isStale(base, null, now)).toBe(true);
  });

  it("is false when there was a transaction within 14 days", () => {
    expect(isStale(base, "2026-02-20T00:00:00Z", now)).toBe(false);
  });

  it("is true when the last transaction is older than 14 days", () => {
    expect(isStale(base, "2026-02-10T00:00:00Z", now)).toBe(true);
  });

  it("is false when last_synced_at is within 14 days", () => {
    expect(isStale({ ...base, last_synced_at: "2026-02-25T00:00:00Z" }, null, now)).toBe(false);
  });
});

describe("groupByKind", () => {
  it("groups and orders by KIND_META.order, omitting empty kinds", () => {
    const accounts = [
      { id: "1", kind: "cash" as AccountKind },
      { id: "2", kind: "platform" as AccountKind },
      { id: "3", kind: "platform" as AccountKind },
    ];
    const groups = groupByKind(accounts);
    expect(groups.map((g) => g.kind)).toEqual(["platform", "cash"]);
    expect(groups[0].accounts).toHaveLength(2);
    expect(groups[0].meta.label).toBe(KIND_META.platform.label);
  });
});
