import { describe, it, expect } from "vitest";
import { pct, projectCompletion, onTrack, crossedMilestone } from "@/lib/goals";

describe("pct", () => {
  it("clamps to 0-100", () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(150, 100)).toBe(100);
    expect(pct(-10, 100)).toBe(0);
    expect(pct(10, 0)).toBe(0);
  });
});

describe("crossedMilestone", () => {
  it("returns the highest newly-crossed mark", () => {
    expect(crossedMilestone(10, 30)).toBe(25);
    expect(crossedMilestone(20, 55)).toBe(50);
    expect(crossedMilestone(0, 100)).toBe(100);
    expect(crossedMilestone(80, 99)).toBe(null);
    expect(crossedMilestone(50, 50)).toBe(null); // already at 50 before
    expect(crossedMilestone(49.9, 50)).toBe(50);
  });
});

describe("projectCompletion", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("returns null with no positive contributions", () => {
    expect(projectCompletion([], 1000, 0, now)).toBe(null);
    expect(projectCompletion([{ amount: -50, occurred_at: "2026-02-01" }], 1000, 0, now)).toBe(null);
  });

  it("returns null when the goal is already met", () => {
    expect(projectCompletion([{ amount: 100, occurred_at: "2026-02-01" }], 1000, 1000, now)).toBe(null);
  });

  it("projects a completion date from the contribution pace", () => {
    // 4 weeks of history, 400/week, 800 saved, 800 remaining -> ~2 weeks out
    const contributions = [
      { amount: 400, occurred_at: "2026-02-01T00:00:00Z" },
      { amount: 400, occurred_at: "2026-02-15T00:00:00Z" },
    ];
    const p = projectCompletion(contributions, 1600, 800, now);
    expect(p).not.toBeNull();
    expect(Math.round(p!.perWeek)).toBe(200);
    expect(Math.round(p!.weeksLeft)).toBe(4);
    // ~4 weeks after 2026-03-01
    expect(p!.projectedDate.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("onTrack", () => {
  it("classifies against the target date", () => {
    const projected = new Date("2026-06-01");
    expect(onTrack(projected, "2026-08-01")).toBe("on_track");
    expect(onTrack(projected, "2026-04-01")).toBe("behind");
    expect(onTrack(projected, null)).toBe("no_date");
    expect(onTrack(null, "2026-08-01")).toBe("no_date");
  });
});
