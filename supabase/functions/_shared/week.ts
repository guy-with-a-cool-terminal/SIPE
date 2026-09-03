// Mon–Sun week boundary math, shared by weekly-review and weekly-review-batch.

export interface WeekBounds {
  /** 00:00 of the current week's Monday (local server time). */
  thisMonday: Date;
  /** 00:00 of the previous week's Monday — start of the completed week. */
  lastMonday: Date;
  /** 23:59:59.999 of the previous week's Sunday — end of the completed week. */
  lastSunday: Date;
}

export function weekBounds(now: Date = new Date()): WeekBounds {
  const dayOfWeek = now.getDay(); // 0 = Sun
  const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysToLastMon);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setMilliseconds(-1);
  return { thisMonday, lastMonday, lastSunday };
}

export function dateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
  return `${fmt(start)} - ${fmt(end)}`;
}
