import { describe, it, expect } from "vitest";
import { splitDeposit, depositPctContribution, type SplitPcts } from "@/lib/splits";

const evenish: SplitPcts = { S: 20, I: 15, P: 50, E: 15 };

describe("splitDeposit", () => {
  it("splits by percentage", () => {
    const lines = splitDeposit(1000, evenish);
    expect(lines).toEqual([
      { bucket: "S", amount: 200 },
      { bucket: "I", amount: 150 },
      { bucket: "P", amount: 500 },
      { bucket: "E", amount: 150 },
    ]);
  });

  it("always sums back to the deposit — last bucket absorbs the remainder", () => {
    const amount = 100.01;
    const lines = splitDeposit(amount, { S: 33, I: 33, P: 33, E: 1 });
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    expect(Number(sum.toFixed(2))).toBe(amount);
    // first three rounded to 2dp, last one carries the leftover cent
    expect(lines[0].amount).toBe(33);
    expect(lines[3].bucket).toBe("E");
  });

  it("skips buckets with 0%", () => {
    const lines = splitDeposit(500, { S: 50, I: 0, P: 50, E: 0 });
    expect(lines.map((l) => l.bucket)).toEqual(["S", "P"]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(500);
  });

  it("handles a single active bucket", () => {
    const lines = splitDeposit(742.37, { S: 0, I: 0, P: 100, E: 0 });
    expect(lines).toEqual([{ bucket: "P", amount: 742.37 }]);
  });

  it("distributes an odd amount without losing cents", () => {
    const lines = splitDeposit(0.1, { S: 33, I: 33, P: 33, E: 1 });
    expect(Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2))).toBe(0.1);
  });
});

describe("depositPctContribution", () => {
  it("computes a rounded percentage of the deposit", () => {
    expect(depositPctContribution(1000, 10)).toBe(100);
    expect(depositPctContribution(333.33, 15)).toBe(50);
  });
});
