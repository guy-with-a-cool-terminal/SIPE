import { describe, expect, it } from "vitest";
import {
  baselineScore, baselineTemplate, buildOnlyStreak, carryOverPlan, currentGoalValue, cycleProgress, derivedStatuses,
  homePath, metricKey, moduleEnabled, moduleForPath, moneySummary, needsReconfirm, projectAttention, statusMap,
  verdictFor, weekStart, isoWeekday,
  type AttentionInput, type Checkin, type ItemStatus,
} from "./projects";

const TODAY = "2026-11-18"; // a Wednesday

describe("weeks", () => {
  it("finds the Monday of the week", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
    expect(isoWeekday("2026-11-22")).toBe(7);
  });
});

describe("baseline", () => {
  it("templates differ by type", () => {
    const keys = (t: Parameters<typeof baselineTemplate>[0]) => baselineTemplate(t).map((d) => d.key);
    expect(keys("webapp")).toContain("sitemap");
    expect(keys("mobile")).not.toContain("sitemap");
    expect(keys("mobile")).toContain("store_listing");
    expect(keys("local")).toContain("google_business");
    expect(keys("shop")).toContain("test_purchase");
    expect(keys("client")).toEqual(["final_invoice", "testimonial", "case_study", "referral", "lesson"]);
    expect(baselineTemplate("content").find((d) => d.key === "posting_rhythm")!.label).toMatch(/1 article a week/);
  });

  it("scores done over applicable; na stops counting; Background needs 80% and all Measured", () => {
    const defs = baselineTemplate("webapp");
    const all: Record<string, ItemStatus> = Object.fromEntries(defs.map((d) => [d.key, "pass" as ItemStatus]));
    expect(baselineScore(defs, all).pct).toBe(1);
    expect(baselineScore(defs, all).readyForBackground).toBe(true);

    const missingMeasured = { ...all, analytics: "fail" as ItemStatus };
    const s1 = baselineScore(defs, missingMeasured);
    expect(s1.pct).toBeGreaterThan(0.9);
    expect(s1.measuredComplete).toBe(false);
    expect(s1.readyForBackground).toBe(false);

    const lowButMeasured: Record<string, ItemStatus> = { ...all };
    for (const k of ["autorenew", "search_console", "directories", "social_profiles", "bio_link", "six_posts", "posting_rhythm"]) lowButMeasured[k] = "fail";
    const s2 = baselineScore(defs, lowButMeasured);
    expect(s2.pct).toBeLessThan(0.8);
    expect(s2.readyForBackground).toBe(false);

    const withNa = { ...lowButMeasured, social_profiles: "na", bio_link: "na", six_posts: "na", posting_rhythm: "na" } as Record<string, ItemStatus>;
    const s3 = baselineScore(defs, withNa);
    expect(s3.total).toBe(defs.length - 4);
    expect(s3.readyForBackground).toBe(true);
    expect(s3.groups.find((g) => g.group === "social")).toBeUndefined();
  });

  it("derives numbers and money items from SIPE data", () => {
    const d = derivedStatuses([{ on_date: "2026-11-01", source: "push" }], { shared: true, income_all: 500, costs_all: 0, bills_monthly: 120 }, TODAY);
    expect(d).toEqual({ numbers_flowing: "pass", money_linked: "pass", costs_recorded: "pass" });
    const old = derivedStatuses([{ on_date: "2026-09-01", source: "snapshot" }, { on_date: "2026-11-18", source: "auto" }], null, TODAY);
    expect(old.numbers_flowing).toBe("fail"); // auto health numbers don't count
    expect(old.money_linked).toBe("unknown");
  });

  it("merges stored, derived and na", () => {
    const defs = baselineTemplate("webapp");
    const m = statusMap(defs, [{ key: "uptime", status: "pass" }, { key: "money_linked", status: "na" }], { numbers_flowing: "pass", money_linked: "fail" });
    expect(m.uptime).toBe("pass");
    expect(m.sitemap).toBe("unknown"); // auto, not checked yet
    expect(m.autorenew).toBe("fail"); // self, not ticked
    expect(m.numbers_flowing).toBe("pass");
    expect(m.money_linked).toBe("na");
  });

  it("asks to re-confirm self items after 90 days", () => {
    expect(needsReconfirm({ source: "self", status: "pass", confirmed_at: "2026-08-01" }, TODAY)).toBe(true);
    expect(needsReconfirm({ source: "self", status: "pass", confirmed_at: "2026-10-01" }, TODAY)).toBe(false);
    expect(needsReconfirm({ source: "auto", status: "pass", confirmed_at: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("cycles", () => {
  const c = { starts_on: "2026-10-01", ends_on: "2026-12-30", target: 45, start_value: 25, halfway_choice: null, status: "active" as const };

  it("works out pace against a straight line from start to goal", () => {
    // day 48 of 90: expected ≈ 25 + 20*48/90 ≈ 35.7
    expect(cycleProgress(c, 35, TODAY).pace).toBe("on_pace");
    expect(cycleProgress(c, 32, TODAY).pace).toBe("behind");
    expect(cycleProgress(c, 26, TODAY).pace).toBe("far_behind");
    expect(cycleProgress(c, 45, TODAY).pace).toBe("hit");
    expect(cycleProgress(c, null, "2026-10-03").pace).toBe("on_pace"); // too early to judge
  });

  it("flags the halfway check once, and the end", () => {
    expect(cycleProgress(c, 30, TODAY).halfwayDue).toBe(true);
    expect(cycleProgress({ ...c, halfway_choice: "keep" }, 30, TODAY).halfwayDue).toBe(false);
    expect(cycleProgress(c, 30, "2026-11-01").halfwayDue).toBe(false);
    expect(cycleProgress(c, 30, "2026-12-30").ended).toBe(true);
    expect(cycleProgress(c, 30, "2026-12-30").halfwayDue).toBe(false);
  });

  it("gives a verdict from the stop rule", () => {
    expect(verdictFor({ target: 45, start_value: 25, stop_below: 30 }, 50)).toBe("hit");
    expect(verdictFor({ target: 45, start_value: 25, stop_below: 30 }, 31)).toBe("partial");
    expect(verdictFor({ target: 45, start_value: 25, stop_below: 30 }, 29)).toBe("missed");
    expect(verdictFor({ target: 45, start_value: 25, stop_below: null }, 34)).toBe("missed"); // under halfway (35)
  });

  it("takes the newest number from metrics or check-ins, within the cycle", () => {
    const v = currentGoalValue(
      { metric: "paying", starts_on: "2026-10-01" },
      [{ metric: "paying", on_date: "2026-11-10", value: 30 }, { metric: "paying", on_date: "2026-09-01", value: 99 }],
      [{ week_start: "2026-11-16", metric_value: 33, created_at: "2026-11-17T08:00:00Z" }],
    );
    expect(v).toBe(33);
  });
});

describe("check-ins", () => {
  const ci = (week_start: string, items: Checkin["items"], user_id = "u") => ({ week_start, items, user_id });
  const b = { text: "ship", tag: "build" as const, done: true };
  const g = { text: "call", tag: "grow" as const, done: true };

  it("counts weeks of building with no growth work, across the team", () => {
    expect(buildOnlyStreak([ci("2026-11-16", [b]), ci("2026-11-09", [b]), ci("2026-11-02", [b])], TODAY)).toBe(3);
    expect(buildOnlyStreak([ci("2026-11-16", [b]), ci("2026-11-09", [g]), ci("2026-11-02", [b])], TODAY)).toBe(1);
    expect(buildOnlyStreak([ci("2026-11-16", [b]), ci("2026-11-16", [g], "v")], TODAY)).toBe(0); // a teammate grew
    expect(buildOnlyStreak([ci("2026-09-01", [b]), ci("2026-09-08", [b]), ci("2026-09-15", [b])], TODAY)).toBe(0); // too old
    expect(buildOnlyStreak([ci("2026-11-16", [{ ...g, done: false }, b])], TODAY)).toBe(1); // planned growth doesn't count
  });

  it("carries last week's plan over as unticked items", () => {
    expect(carryOverPlan({ next_plan: "Post 2 reels · call 3 shops\n- ship reminders" }).map((i) => i.text))
      .toEqual(["Post 2 reels", "call 3 shops", "ship reminders"]);
    expect(carryOverPlan(null)).toEqual([]);
  });
});

describe("money", () => {
  it("applies my share and per hour", () => {
    const m = moneySummary({ shared: true, income_all: 78000, costs_all: 12400 }, 50, 104)!;
    expect(m.myShare).toBe(39000);
    expect(m.net).toBe(32800);
    expect(Math.round(m.perHour!)).toBe(315);
    expect(moneySummary({ shared: false }, 50, 10)).toBeNull();
    expect(moneySummary({ shared: true, income_all: 100, costs_all: 0 }, null, 0)!.perHour).toBeNull();
  });
});

describe("attention", () => {
  const base: AttentionInput = {
    project: { id: "p", name: "Salonly", stage: "launched", launch_date: null, stage_changed_at: "2026-06-01T00:00:00Z", killed_at: null, type: "webapp" },
    role: "owner", mode: "focus", userId: "u",
    cycle: { starts_on: "2026-10-01", ends_on: "2026-12-30", target: 45, start_value: 25, halfway_choice: "keep", status: "active" },
    checkins: [{ user_id: "u", week_start: "2026-11-09", items: [{ text: "x", tag: "grow", done: true }] }],
    baselineRows: [], baselinePct: 0.9, metrics: [{ on_date: "2026-11-10", source: "push" }], goalValue: 35,
  };
  const kinds = (i: AttentionInput, d = TODAY) => projectAttention(i, d).map((a) => a.kind);

  it("asks for a check-in from Friday, and flags a missed week early in the next", () => {
    expect(kinds(base, "2026-11-20")).toEqual(["checkin_due"]); // Friday, none this week
    expect(kinds(base)).toEqual([]); // Wednesday, last week done
    expect(kinds({ ...base, checkins: [{ user_id: "u", week_start: "2026-11-02", items: [] }] }, "2026-11-17")).toEqual(["checkin_late"]);
  });

  it("asks for a goal, the halfway check and the review", () => {
    expect(kinds({ ...base, cycle: null })).toContain("set_goal");
    expect(kinds({ ...base, role: "contributor", cycle: null })).not.toContain("set_goal");
    expect(kinds({ ...base, cycle: { ...base.cycle!, halfway_choice: null } })).toContain("halfway");
    expect(kinds(base, "2027-01-02")).toContain("cycle_ended");
  });

  it("flags site trouble first, and Background projects that went quiet or slipped", () => {
    const rows = [{ key: "uptime", status: "fail" as const, detail: null }, { key: "domain", status: "fail" as const, detail: "domain renews in 12 days" }];
    const a = projectAttention({ ...base, baselineRows: rows }, TODAY);
    expect(a[0].kind).toBe("site_down");
    expect(a.map((x) => x.kind)).toContain("domain_expiring");
    const bg = kinds({ ...base, mode: "background", metrics: [{ on_date: "2026-09-01", source: "snapshot" }], baselinePct: 0.6 });
    expect(bg).toEqual(["gone_quiet", "baseline_low"]);
    expect(kinds({ ...base, mode: "parked", baselineRows: rows })).toEqual(["domain_expiring"]);
    expect(kinds({ ...base, project: { ...base.project, killed_at: "2026-11-01" } })).toEqual([]);
  });
});

describe("modules", () => {
  it("treats null as everything on, and finds a home", () => {
    expect(moduleEnabled(null, "debts")).toBe(true);
    expect(moduleEnabled(["projects"], "money")).toBe(false);
    expect(homePath(["projects"])).toBe("/projects");
    expect(homePath(null)).toBe("/dashboard");
    expect(moduleForPath("/invoices/abc")).toBe("invoicing");
    expect(moduleForPath("/settings")).toBeNull();
  });
  it("makes database-safe metric keys", () => {
    expect(metricKey("Paying salons")).toBe("paying_salons");
    expect(metricKey("10k club")).toBe("m_10k_club");
  });
});
