import { describe, expect, it } from "vitest";
import {
  drawdownInterest, grow, incomeNeeded, minExpensesPct, monthlyEquivalent, monthlyNeeded,
  monthsAhead, monthsToReach, monthsUntil, moveInTotal, netRate, nextStep, prepayOrKeep,
  projectOptions, rateFor, surplusSuggestion, typicalMonthlyIncome, SAVINGS_OPTIONS,
} from "./planner";

const at = (y: number, m: number, d = 10) => new Date(y, m - 1, d).toISOString();

describe("monthlyEquivalent", () => {
  it("spreads non-monthly bills", () => {
    expect(monthlyEquivalent(36_000, 12)).toBe(3_000);
    expect(monthlyEquivalent(2_000)).toBe(2_000);
    expect(monthlyEquivalent(2_000, 0)).toBe(2_000);
  });
});

describe("typicalMonthlyIncome", () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026

  it("uses the median of complete months, ignoring the current month", () => {
    const rows = [
      { amount: 100_000, occurred_at: at(2026, 8) },
      { amount: 120_000, occurred_at: at(2026, 9) },
      { amount: 500_000, occurred_at: at(2026, 10) }, // one big month
      { amount: 1, occurred_at: at(2026, 11) },
    ];
    const t = typicalMonthlyIncome(rows, now);
    expect(t.basis).toBe("median");
    expect(t.monthsUsed).toBe(3);
    expect(t.monthly).toBe(120_000);
  });

  it("counts empty months after the first income as zero", () => {
    const rows = [
      { amount: 90_000, occurred_at: at(2026, 7) },
      { amount: 90_000, occurred_at: at(2026, 10) },
    ];
    // Jul 90k, Aug 0, Sep 0, Oct 90k → median 45k
    expect(typicalMonthlyIncome(rows, now).monthly).toBe(45_000);
  });

  it("falls back to this month for a new user", () => {
    const t = typicalMonthlyIncome([{ amount: 40_000, occurred_at: at(2026, 11, 2) }], now);
    expect(t).toMatchObject({ monthly: 40_000, basis: "this-month" });
  });

  it("averages payment size", () => {
    const rows = [
      { amount: 20_000, occurred_at: at(2026, 10, 1) },
      { amount: 40_000, occurred_at: at(2026, 10, 20) },
    ];
    expect(typicalMonthlyIncome(rows, now).avgPayment).toBe(30_000);
  });

  it("handles no income", () => {
    expect(typicalMonthlyIncome([], now).basis).toBe("none");
  });
});

describe("minExpensesPct", () => {
  it("rounds up", () => {
    expect(minExpensesPct(46_000, 120_000)).toBe(39);
    expect(minExpensesPct(1, 0)).toBeNull();
  });
});

describe("saving maths", () => {
  it("without interest is plain division", () => {
    expect(monthlyNeeded(300_000, 0, 12)).toBe(25_000);
    expect(monthsToReach(36_000, 0, 18_000)).toBe(2);
  });

  it("with interest needs a little less each month", () => {
    const r = netRate(0.1); // 8.5%
    const d = monthlyNeeded(300_000, 0, 12, r);
    expect(d).toBeGreaterThan(24_000);
    expect(d).toBeLessThan(24_100);
    expect(grow(0, d, r, 12).balance).toBeCloseTo(300_000, 0);
  });

  it("counts what's already saved", () => {
    expect(monthlyNeeded(100, 100, 12)).toBe(0);
    expect(monthsToReach(100, 150, 10)).toBe(0);
    expect(monthsToReach(100, 0, 0)).toBeNull();
  });

  it("works out the income needed for a share", () => {
    expect(incomeNeeded(25_000, 15)).toBeCloseTo(166_666.67, 1);
    expect(incomeNeeded(25_000, 0)).toBeNull();
  });

  it("counts whole months to a date", () => {
    expect(monthsUntil(new Date(2027, 10, 15), new Date(2026, 10, 15))).toBe(12);
    expect(monthsUntil(new Date(2026, 10, 20), new Date(2026, 10, 15))).toBe(1);
  });
});

describe("paying ahead", () => {
  it("matches the worked example: 300k paid out over a year at 8.5% net", () => {
    expect(drawdownInterest(25_000, 12, netRate(0.1))).toBeCloseTo(12_340, -1);
  });

  it("prepay wins when the discount beats the interest", () => {
    const r = prepayOrKeep(25_000, 12, 25_000, netRate(0.1));
    expect(r.verdict).toBe("prepay");
    expect(r.upfront).toBe(275_000);
  });

  it("keep wins with no discount", () => {
    expect(prepayOrKeep(25_000, 12, 0, netRate(0.1)).verdict).toBe("keep");
  });
});

describe("rateFor", () => {
  it("grosses up for tax and spreads over billable hours", () => {
    const r = rateFor({ monthlyNeed: 100_000, monthlyCosts: 0, billableHoursPerWeek: 20, weeksOff: 2, taxPct: 0 })!;
    expect(r.billableHoursPerYear).toBe(1_000);
    expect(r.hourly).toBe(1_200);
    expect(r.daily).toBe(4_800);
  });

  it("rejects impossible input", () => {
    expect(rateFor({ monthlyNeed: 1, monthlyCosts: 0, billableHoursPerWeek: 0, weeksOff: 0, taxPct: 0 })).toBeNull();
  });
});

describe("projectOptions", () => {
  it("earns nothing when idle and flags minimums", () => {
    const p = projectOptions(60_000, 0, 12, SAVINGS_OPTIONS);
    expect(p.find((x) => x.option.key === "idle")!.interest).toBe(0);
    expect(p.find((x) => x.option.key === "tbill")!.belowMinimum).toBe(true);
    expect(p.find((x) => x.option.key === "mmf")!.interest).toBeGreaterThan(0);
  });
});

describe("months ahead", () => {
  it("floors to one decimal", () => {
    expect(monthsAhead(70_000, 25_000)).toBe(2.8);
    expect(monthsAhead(0, 25_000)).toBe(0);
    expect(monthsAhead(10, 0)).toBe(0);
  });

  it("finds the next step", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(2.8)).toBe(3);
    expect(nextStep(3)).toBe(6);
    expect(nextStep(12)).toBeNull();
  });

  it("suggests half the surplus, capped by what's left", () => {
    expect(surplusSuggestion(200_000, 120_000, 1_000_000)).toBe(40_000);
    expect(surplusSuggestion(200_000, 120_000, 15_000)).toBe(15_000);
    expect(surplusSuggestion(100_000, 120_000, 50_000)).toBeNull();
    expect(surplusSuggestion(200_000, 0, 50_000)).toBeNull();
  });
});

describe("moveInTotal", () => {
  it("adds deposit, advance and extras", () => {
    expect(moveInTotal({ rent: 25_000, depositMonths: 1, advanceMonths: 1, extras: [3_000, 2_500, NaN] })).toBe(55_500);
  });
});
