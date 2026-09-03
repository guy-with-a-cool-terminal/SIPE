// Pure helpers for the Goals feature (no React, no Supabase).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Progress toward a target, clamped to 0–100. */
export function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

export interface Projection {
  /** Average contribution rate, KES per week. */
  perWeek: number;
  /** Weeks from `now` until the target is reached at that rate. */
  weeksLeft: number;
  /** Estimated completion date. */
  projectedDate: Date;
}

interface ContributionLike {
  amount: number;
  occurred_at: string | Date;
}

/**
 * Estimate when a goal completes, based on the average pace of positive
 * contributions so far. Returns null when there is nothing to project from
 * (no positive contributions) or the goal is already met.
 */
export function projectCompletion(
  contributions: ContributionLike[],
  target: number,
  current: number,
  now: Date = new Date(),
): Projection | null {
  const positive = contributions.filter((c) => Number(c.amount) > 0);
  if (positive.length === 0) return null;

  const remaining = target - current;
  if (remaining <= 0) return null;

  const times = positive.map((c) => new Date(c.occurred_at).getTime());
  const earliest = Math.min(...times);
  // Guard against a zero/short span so the rate stays sane.
  const spanWeeks = Math.max(now.getTime() - earliest, WEEK_MS) / WEEK_MS;

  const total = positive.reduce((s, c) => s + Number(c.amount), 0);
  const perWeek = total / spanWeeks;
  if (perWeek <= 0) return null;

  const weeksLeft = remaining / perWeek;
  const projectedDate = new Date(now.getTime() + weeksLeft * WEEK_MS);
  return { perWeek, weeksLeft, projectedDate };
}

/** Compare a projected completion date against the goal's target date. */
export function onTrack(
  projectedDate: Date | null,
  targetDate: Date | string | null,
): "on_track" | "behind" | "no_date" {
  if (!targetDate || !projectedDate) return "no_date";
  const target = new Date(targetDate).getTime();
  return projectedDate.getTime() <= target ? "on_track" : "behind";
}

/**
 * The highest of the 25 / 50 / 75 / 100 milestones newly crossed when progress
 * moved from `prevPct` to `curPct`. Null if none was crossed.
 */
export function crossedMilestone(prevPct: number, curPct: number): 25 | 50 | 75 | 100 | null {
  const marks: (25 | 50 | 75 | 100)[] = [100, 75, 50, 25];
  for (const m of marks) {
    if (prevPct < m && curPct >= m) return m;
  }
  return null;
}
