// Goal milestone helpers — Deno port of the pure fns in src/lib/goals.ts.
// Kept in sync by hand; see src/lib/goals.test.ts for the canonical cases.

export type Milestone = 25 | 50 | 75 | 100;
const MARKS: Milestone[] = [100, 75, 50, 25];

/** Progress toward a target, clamped to 0–100. */
export function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

/**
 * The highest of the 25 / 50 / 75 / 100 milestones newly crossed when progress
 * moved from `prevPct` to `curPct`. Null if none was crossed.
 */
export function crossedMilestone(prevPct: number, curPct: number): Milestone | null {
  for (const m of MARKS) {
    if (prevPct < m && curPct >= m) return m;
  }
  return null;
}

/** The highest milestone `curPct` has reached, ignoring history. */
export function highestMilestone(curPct: number): Milestone | null {
  return MARKS.find((m) => curPct >= m) ?? null;
}
