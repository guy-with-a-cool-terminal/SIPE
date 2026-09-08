/**
 * Convert an `<input type="date">` value ("YYYY-MM-DD") to an ISO timestamp.
 *
 * `new Date("2026-09-08")` parses as UTC midnight, which is the previous calendar
 * day in any timezone west of UTC. Anchoring at local midday keeps the date the
 * user picked intact through a `toISOString()` / `toLocaleDateString()` round-trip.
 * See docs/design/AVOIDING_AI_VIBES.md §1.3.
 */
export function dateInputToISO(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
