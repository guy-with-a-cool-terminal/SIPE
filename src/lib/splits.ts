// Pure deposit-split math. Mirrors the edge-function logic (record-deposit /
// paystack-webhook) so the split can be unit-tested in isolation.

import type { Bucket } from "@/integrations/supabase/types";

export type SplitPcts = Record<Bucket, number>;

export interface SplitLine {
  bucket: Bucket;
  amount: number;
}

const ORDER: Bucket[] = ["S", "I", "P", "E"];

/**
 * Split `amount` across the buckets whose percentage is > 0. Every line except
 * the last is rounded to 2dp; the last active bucket absorbs the remainder so
 * the lines always sum back to `amount` exactly.
 */
export function splitDeposit(amount: number, pcts: SplitPcts): SplitLine[] {
  const active = ORDER.filter((b) => (pcts[b] ?? 0) > 0);
  const lines: SplitLine[] = [];
  let allocated = 0;
  active.forEach((bucket, i) => {
    const value = i === active.length - 1
      ? round2(amount - allocated)
      : round2((amount * pcts[bucket]) / 100);
    allocated = round2(allocated + value);
    lines.push({ bucket, amount: value });
  });
  return lines;
}

/** The contribution a `deposit_pct` goal receives from a deposit of `amount`. */
export function depositPctContribution(amount: number, pct: number): number {
  return round2((amount * pct) / 100);
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/** The split new accounts start with (allocation_settings defaults). Shown on the landing and sign-in pages. */
export const DEFAULT_SPLIT: { bucket: Bucket; pct: number; use: string }[] = [
  { bucket: "S", pct: 20, use: "A cushion for slow months and the tax bill." },
  { bucket: "I", pct: 15, use: "Money that should grow, kept apart from spending." },
  { bucket: "P", pct: 50, use: "Your salary, paid to yourself on a schedule." },
  { bucket: "E", pct: 15, use: "Tools, data, transport and the bills of doing the work." },
];
