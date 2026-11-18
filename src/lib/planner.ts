// Pure maths behind the in-app calculators (no React, no Supabase).
//
// Rates are annual and expressed as fractions (0.09 = 9%). Interest compounds
// monthly. "Net" rates are after withholding tax on the interest.

/** Kenyan withholding tax on interest from banks, MMFs and T-bills. */
export const INTEREST_WHT = 0.15;

export const BILL_INTERVALS = [1, 3, 6, 12] as const;
export type BillInterval = (typeof BILL_INTERVALS)[number];

export const INTERVAL_LABEL: Record<number, string> = {
  1: "Monthly",
  3: "Every 3 months",
  6: "Every 6 months",
  12: "Yearly",
};

/** What a bill costs per month on average (a 36k yearly bill = 3k a month). */
export function monthlyEquivalent(amount: number, everyMonths = 1): number {
  return amount / Math.max(1, everyMonths || 1);
}

export function netRate(grossRate: number, taxRate = INTEREST_WHT): number {
  return grossRate * (1 - taxRate);
}

// ─── Income ────────────────────────────────────────────────────────────────

export interface TypicalIncome {
  /** KES a month the calculators plan around. 0 when there is no income yet. */
  monthly: number;
  /** "median" of complete months, "this-month" when only the current month has data. */
  basis: "median" | "this-month" | "none";
  /** How many months the figure is based on. */
  monthsUsed: number;
  /** Average size of one income payment in the window. */
  avgPayment: number;
}

interface IncomeRow {
  amount: number;
  occurred_at: string | Date;
}

const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/**
 * A freelancer's "typical month": the median income of the last `lookback`
 * complete months. Median, not average, so one big month doesn't inflate the
 * plan. Months with no income count as zero, but only from the first month
 * that had income (so a new user isn't dragged down by months before signup).
 */
export function typicalMonthlyIncome(
  rows: IncomeRow[],
  now: Date = new Date(),
  lookback = 6,
): TypicalIncome {
  if (rows.length === 0) return { monthly: 0, basis: "none", monthsUsed: 0, avgPayment: 0 };

  const current = monthIndex(now);
  const windowStart = current - lookback;
  const totals = new Map<number, number>();
  let first = Infinity;
  let sum = 0;
  let count = 0;

  for (const r of rows) {
    const idx = monthIndex(new Date(r.occurred_at));
    if (idx < windowStart || idx > current) continue;
    const amt = Number(r.amount);
    totals.set(idx, (totals.get(idx) ?? 0) + amt);
    first = Math.min(first, idx);
    sum += amt;
    count += 1;
  }
  const avgPayment = count > 0 ? sum / count : 0;

  if (first === Infinity) return { monthly: 0, basis: "none", monthsUsed: 0, avgPayment: 0 };

  const complete: number[] = [];
  for (let m = first; m < current; m++) complete.push(totals.get(m) ?? 0);

  if (complete.length === 0) {
    return { monthly: totals.get(current) ?? 0, basis: "this-month", monthsUsed: 1, avgPayment };
  }
  return { monthly: median(complete), basis: "median", monthsUsed: complete.length, avgPayment };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The smallest whole Expenses % that covers `billsMonthly` from `income`. */
export function minExpensesPct(billsMonthly: number, income: number): number | null {
  if (income <= 0) return null;
  return Math.ceil((billsMonthly / income) * 100);
}

// ─── Saving towards a target ───────────────────────────────────────────────

export interface Growth {
  balance: number;
  interest: number;
  contributed: number;
}

/** Grow `start` for `months`, adding `monthlyAdd` at the end of each month. */
export function grow(start: number, monthlyAdd: number, annualRate: number, months: number): Growth {
  const i = annualRate / 12;
  let bal = start;
  for (let m = 0; m < months; m++) bal = bal * (1 + i) + monthlyAdd;
  const contributed = monthlyAdd * months;
  return { balance: bal, interest: bal - start - contributed, contributed };
}

/** Monthly deposit needed to reach `target` in `months`, given `current` already saved. */
export function monthlyNeeded(target: number, current: number, months: number, annualRate = 0): number {
  if (current >= target) return 0;
  if (months <= 0) return target - current;
  const i = annualRate / 12;
  if (i === 0) return (target - current) / months;
  const g = (1 + i) ** months;
  return Math.max(0, ((target - current * g) * i) / (g - 1));
}

/** Months until `target` is reached at `perMonth`. Null if it never gets there (within 50 years). */
export function monthsToReach(target: number, current: number, perMonth: number, annualRate = 0): number | null {
  if (current >= target) return 0;
  const i = annualRate / 12;
  let bal = current;
  for (let m = 1; m <= 600; m++) {
    bal = bal * (1 + i) + perMonth;
    if (bal >= target - 0.005) return m;
  }
  return null;
}

/** Income a month needed so that `sharePct` of it equals `perMonth`. */
export function incomeNeeded(perMonth: number, sharePct: number): number | null {
  if (sharePct <= 0) return null;
  return perMonth / (sharePct / 100);
}

/** Calendar date `months` from `from` (fractional months round up). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + Math.ceil(months));
  return d;
}

/** Whole months from `from` until `to` (at least 1). */
export function monthsUntil(to: Date, from: Date = new Date()): number {
  const diff = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const partial = to.getDate() >= from.getDate() ? 0 : -1;
  return Math.max(1, diff + partial);
}

// ─── Months ahead ──────────────────────────────────────────────────────────

/** The steps of the get-ahead ladder, in months. */
export const AHEAD_STEPS = [1, 3, 6, 12] as const;

/** How many months of a bill `saved` covers (one decimal place, floored). */
export function monthsAhead(saved: number, monthlyCost: number): number {
  if (monthlyCost <= 0 || saved <= 0) return 0;
  return Math.floor((saved / monthlyCost) * 10) / 10;
}

/** The next ladder step above `months`, or null once past 12. */
export function nextStep(months: number): number | null {
  return AHEAD_STEPS.find((s) => s > months) ?? null;
}

/**
 * How much of a payment to suggest putting towards a goal: half of whatever
 * came in above a typical month, capped at what the goal still needs.
 * Null when the payment wasn't above a typical month.
 */
export function surplusSuggestion(payment: number, typicalMonth: number, goalRemaining: number): number | null {
  if (typicalMonth <= 0 || payment <= typicalMonth || goalRemaining <= 0) return null;
  const half = Math.round((payment - typicalMonth) / 2 / 100) * 100;
  const amt = Math.min(half, Math.round(goalRemaining));
  return amt > 0 ? amt : null;
}

// ─── Paying ahead ──────────────────────────────────────────────────────────

/**
 * Interest earned by holding `months` of a bill and paying it out monthly,
 * one payment at the start of each month.
 */
export function drawdownInterest(monthly: number, months: number, annualRate: number): number {
  const i = annualRate / 12;
  let bal = monthly * months;
  let interest = 0;
  for (let k = 0; k < months; k++) {
    bal -= monthly;
    const x = bal * i;
    interest += x;
    bal += x;
  }
  return interest;
}

export interface PrepayResult {
  /** What you'd hand over if you prepay. */
  upfront: number;
  /** Interest earned if you keep the money and pay monthly instead. */
  keepInterest: number;
  verdict: "prepay" | "keep" | "same";
  /** How much better the winning option is. */
  margin: number;
}

export function prepayOrKeep(monthly: number, months: number, discount: number, annualNetRate: number): PrepayResult {
  const keepInterest = drawdownInterest(monthly, months, annualNetRate);
  const margin = Math.abs(discount - keepInterest);
  const verdict = margin < 1 ? "same" : discount > keepInterest ? "prepay" : "keep";
  return { upfront: monthly * months - discount, keepInterest, verdict, margin };
}

// ─── Pricing ───────────────────────────────────────────────────────────────

export interface RateInput {
  /** What you need to come in each month (after costs and tax). */
  monthlyNeed: number;
  /** Business costs a month (tools, data, transport). */
  monthlyCosts: number;
  billableHoursPerWeek: number;
  weeksOff: number;
  taxPct: number;
}

export interface RateResult {
  hourly: number;
  daily: number;
  monthlyRevenue: number;
  billableHoursPerYear: number;
}

export function rateFor(input: RateInput): RateResult | null {
  const weeks = 52 - Math.max(0, input.weeksOff);
  const hours = input.billableHoursPerWeek * weeks;
  const keep = 1 - input.taxPct / 100;
  if (hours <= 0 || keep <= 0) return null;
  const annual = ((input.monthlyNeed + input.monthlyCosts) * 12) / keep;
  const hourly = annual / hours;
  return {
    hourly,
    daily: hourly * (input.billableHoursPerWeek / 5),
    monthlyRevenue: annual / 12,
    billableHoursPerYear: hours,
  };
}

// ─── Where to keep savings ─────────────────────────────────────────────────

export interface SavingsOption {
  key: string;
  name: string;
  /** Example gross annual rate. Shown as editable; never presented as a quote. */
  grossRate: number;
  taxRate: number;
  access: string;
  note: string;
  /** Smallest amount the option accepts, if any. */
  minimum?: number;
}

/**
 * Example rates for Kenyan savings options. They move with the CBK rate, so the
 * UI labels them as examples and lets the user type today's quote.
 */
export const SAVINGS_OPTIONS: SavingsOption[] = [
  { key: "idle", name: "Leave it as is", grossRate: 0, taxRate: 0, access: "Instant", note: "M-Pesa or a current account. No interest." },
  { key: "savings", name: "Bank savings account", grossRate: 0.03, taxRate: INTEREST_WHT, access: "Same day", note: "Easy access, low rate." },
  { key: "mmf", name: "Money market fund", grossRate: 0.09, taxRate: INTEREST_WHT, access: "1 to 3 working days", note: "Interest added daily, no lock-in." },
  { key: "fixed", name: "Bank fixed deposit", grossRate: 0.08, taxRate: INTEREST_WHT, access: "Locked for the term", note: "Breaking it early usually costs the interest." },
  { key: "tbill", name: "Treasury bill (364 days)", grossRate: 0.095, taxRate: INTEREST_WHT, access: "Locked for a year", note: "Bought through CBK DhowCSD.", minimum: 100_000 },
  { key: "ifb", name: "Infrastructure bond", grossRate: 0.13, taxRate: 0, access: "Years (can sell early on the NSE)", note: "Tax-free interest twice a year. Long-term money only.", minimum: 50_000 },
  { key: "sacco", name: "SACCO deposits", grossRate: 0.1, taxRate: 0.05, access: "Notice to withdraw (often 60 days)", note: "Paid once a year. Also unlocks loans." },
];

/** Savings in the S bucket below this don't get the "where to keep it" nudge. */
export const SAVINGS_NUDGE_MIN = 10_000;

export interface OptionProjection {
  option: SavingsOption;
  netRate: number;
  balance: number;
  interest: number;
  /** True when the starting amount is below the option's minimum. */
  belowMinimum: boolean;
}

export function projectOptions(
  amount: number,
  monthlyAdd: number,
  months: number,
  options: SavingsOption[],
): OptionProjection[] {
  return options.map((option) => {
    const r = netRate(option.grossRate, option.taxRate);
    const g = grow(amount, monthlyAdd, r, months);
    return {
      option,
      netRate: r,
      balance: g.balance,
      interest: g.interest,
      belowMinimum: option.minimum != null && amount < option.minimum,
    };
  });
}

// ─── Move-in ───────────────────────────────────────────────────────────────

export interface MoveInInput {
  rent: number;
  depositMonths: number;
  /** Months of rent paid in advance on top of the deposit (usually 1). */
  advanceMonths: number;
  extras: number[];
}

export function moveInTotal(input: MoveInInput): number {
  const extras = input.extras.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  return input.rent * (input.depositMonths + input.advanceMonths) + extras;
}
