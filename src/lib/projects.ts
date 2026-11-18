/**
 * Projects: types, baseline templates, cycle pace, check-in flags and the
 * "needs you" list. Pure functions only (tested in projects.test.ts); the
 * Dashboard card, the Projects pages and the weekly email all read from here.
 *
 * Dates are "YYYY-MM-DD" strings compared as calendar days, so a check-in made
 * late on Sunday night still counts for that week.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ProjectKind = "venture" | "client";
export type ProjectType = "webapp" | "content" | "shop" | "mobile" | "local" | "client";
export type Stage = "idea" | "building" | "launched" | "growing" | "sustaining";
export type Mode = "focus" | "background" | "parked";
export type Role = "owner" | "cofounder" | "contributor" | "viewer" | "client";

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  kind: ProjectKind;
  type: ProjectType;
  stage: Stage;
  url: string | null;
  one_liner: string | null;
  client_id: string | null;
  north_star: string | null;
  north_star_metric: string | null;
  north_star_target: number | null;
  launch_date: string | null;
  money_shared: boolean;
  killed_at: string | null;
  killed_reason: string | null;
  stage_changed_at: string;
  created_at: string;
}

export interface Membership {
  id: string;
  project_id: string;
  user_id: string | null;
  email: string;
  role: Role;
  status: "invited" | "active";
  mode: Mode;
  share_pct: number | null;
}

export interface TeamMember {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: Role;
  status: "invited" | "active";
  share_pct: number | null;
  joined_at: string | null;
  created_at: string;
}

export type StopAction = "change" | "background" | "park" | "kill";
export type Decision = "continue" | "change" | "background" | "park" | "kill";
export type Verdict = "hit" | "partial" | "missed";

export interface Cycle {
  id: string;
  project_id: string;
  n: number;
  metric: string;
  target: number;
  start_value: number;
  starts_on: string;
  ends_on: string;
  plan: string | null;
  stop_below: number | null;
  stop_action: StopAction | null;
  hours_per_week: number | null;
  halfway_choice: "keep" | "change" | null;
  halfway_note: string | null;
  result: number | null;
  verdict: Verdict | null;
  decision: Decision | null;
  lesson: string | null;
  status: "active" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface CheckinItem {
  text: string;
  tag: "build" | "grow";
  done: boolean;
}

export interface Checkin {
  id: string;
  project_id: string;
  user_id: string;
  week_start: string;
  items: CheckinItem[];
  blockers: string | null;
  actions: string | null;
  metric_value: number | null;
  hours: number | null;
  confidence: number | null;
  next_plan: string | null;
  created_at: string;
}

export type ItemStatus = "pass" | "fail" | "na" | "unknown";

export interface BaselineRow {
  project_id: string;
  key: string;
  status: ItemStatus;
  source: "auto" | "self";
  detail: string | null;
  checked_at: string | null;
  confirmed_at: string | null;
}

export interface MetricRow {
  project_id: string;
  metric: string;
  on_date: string;
  value: number;
  source: "auto" | "push" | "snapshot";
}

export interface ProjectMoney {
  shared: boolean;
  income_all?: number;
  costs_all?: number;
  income_90d?: number;
  costs_90d?: number;
  bills_monthly?: number;
  documents_open?: number;
  months?: { month: string; income: number; costs: number }[];
  hours?: { user_id: string; hours: number }[];
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export const STAGES: { key: Stage; label: string; blurb: string }[] = [
  { key: "idea", label: "Idea", blurb: "Not started. Safe to keep here without pressure." },
  { key: "building", label: "Building", blurb: "Being made, not live yet." },
  { key: "launched", label: "Launched", blurb: "Live, first users, no steady growth yet." },
  { key: "growing", label: "Growing", blurb: "Numbers rising month on month." },
  { key: "sustaining", label: "Sustaining", blurb: "Steady. Mostly needs upkeep." },
];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)?.label ?? s;
export const isLive = (s: Stage) => s === "launched" || s === "growing" || s === "sustaining";

export const TYPES: { key: ProjectType; label: string }[] = [
  { key: "webapp", label: "Web app / SaaS" },
  { key: "content", label: "Content site / blog" },
  { key: "shop", label: "Online shop" },
  { key: "mobile", label: "Mobile app" },
  { key: "local", label: "Local business" },
  { key: "client", label: "Client project" },
];
export const typeLabel = (t: ProjectType) => TYPES.find((x) => x.key === t)?.label ?? t;

export const MODES: { key: Mode; label: string; blurb: string }[] = [
  { key: "focus", label: "Focus", blurb: "Your real hours. Weekly check-in and a 90-day goal." },
  { key: "background", label: "Background", blurb: "Runs and measures itself. Monthly numbers." },
  { key: "parked", label: "Parked", blurb: "Switched off on purpose. No check-ins." },
];
export const modeLabel = (m: Mode) => MODES.find((x) => x.key === m)?.label ?? m;

export const ROLES: { key: Role; label: string; blurb: string }[] = [
  { key: "owner", label: "Owner", blurb: "Everything, including the team and settings." },
  { key: "cofounder", label: "Co-founder", blurb: "Edit everything, set goals, see money if shared." },
  { key: "contributor", label: "Contributor", blurb: "Check in, log hours, see goals and numbers." },
  { key: "viewer", label: "Viewer", blurb: "Read only. For advisers and mentors." },
  { key: "client", label: "Client", blurb: "Client view of a client project." },
];
export const roleLabel = (r: Role) => ROLES.find((x) => x.key === r)?.label ?? r;
export const canEdit = (r: Role | null | undefined) => r === "owner" || r === "cofounder";
export const canCheckIn = (r: Role | null | undefined) => r === "owner" || r === "cofounder" || r === "contributor";

/** The standard numbers every project can track, plus anything custom. */
export const STANDARD_METRICS: { key: string; label: string }[] = [
  { key: "visitors", label: "Visitors" },
  { key: "signups", label: "Signups / leads" },
  { key: "active_users", label: "Active users" },
  { key: "paying_customers", label: "Paying customers" },
  { key: "search_clicks", label: "Search clicks" },
  { key: "followers", label: "Followers" },
  { key: "posts", label: "Posts published" },
];
/** Numbers SIPE writes itself; not offered as goals. */
export const AUTO_METRICS = new Set(["site_up", "domain_days_left"]);

export function metricLabel(key: string): string {
  const std = STANDARD_METRICS.find((m) => m.key === key);
  if (std) return std.label;
  if (key === "revenue") return "Revenue (KES)";
  if (key === "site_up") return "Site up";
  if (key === "domain_days_left") return "Days until domain renewal";
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Paying salons" → "paying_salons" (the metric key format the database accepts). */
export function metricKey(label: string): string {
  const k = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const withLetter = /^[a-z]/.test(k) ? k : `m_${k}`;
  return withLetter.slice(0, 40) || "metric";
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export const todayISO = () => {
  const d = new Date();
  return fmt(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
export const daysBetween = (from: string, to: string) => Math.round((parse(to) - parse(from)) / 86_400_000);
export const addDays = (iso: string, n: number) => fmt(parse(iso) + n * 86_400_000);

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const t = parse(iso);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return fmt(t - ((dow + 6) % 7) * 86_400_000);
}
/** 1 = Monday ... 7 = Sunday */
export const isoWeekday = (iso: string) => ((new Date(parse(iso)).getUTCDay() + 6) % 7) + 1;

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------
export type BaselineGroup = "online" | "findable" | "answerable" | "social" | "measured" | "reachable" | "wrapup";

export const BASELINE_GROUPS: { key: BaselineGroup; label: string; blurb: string }[] = [
  { key: "online", label: "Online", blurb: "Is it there?" },
  { key: "findable", label: "Findable", blurb: "Search engines (SEO)" },
  { key: "answerable", label: "Answerable", blurb: "AI assistants (AEO)" },
  { key: "social", label: "Social", blurb: "Can people follow it?" },
  { key: "measured", label: "Measured", blurb: "Required in full for Background" },
  { key: "reachable", label: "Reachable and running", blurb: "Can it survive without you?" },
  { key: "wrapup", label: "Wrap-up", blurb: "Turn finished work into future work" },
];

/** auto: SIPE's daily check. derived: worked out from SIPE data. self: you tick it. */
export type ItemSource = "auto" | "derived" | "self";

export interface BaselineItemDef {
  key: string;
  group: BaselineGroup;
  label: string;
  source: ItemSource;
  hint?: string;
}

const STANDARD: BaselineItemDef[] = [
  { key: "domain", group: "online", label: "Domain owned, renewal date known", source: "auto", hint: "Looked up in the public domain registry (RDAP). Flags renewals within 30 days." },
  { key: "autorenew", group: "online", label: "Auto-renew turned on", source: "self", hint: "In your domain registrar's settings." },
  { key: "uptime", group: "online", label: "Site loads", source: "auto" },
  { key: "https", group: "online", label: "Secure connection (HTTPS)", source: "auto" },
  { key: "email_domain", group: "online", label: "Email on the domain (hello@...)", source: "auto", hint: "Checks the domain has mail (MX) records." },

  { key: "title_meta", group: "findable", label: "Page title and description", source: "auto" },
  { key: "sitemap", group: "findable", label: "Sitemap", source: "auto", hint: "/sitemap.xml, or a Sitemap line in robots.txt." },
  { key: "robots", group: "findable", label: "Search engines not blocked", source: "auto" },
  { key: "og_preview", group: "findable", label: "Link preview (image and title)", source: "auto", hint: "Open Graph tags, used when the link is shared on WhatsApp, X or LinkedIn." },
  { key: "search_console", group: "findable", label: "Google Search Console set up", source: "self" },

  { key: "schema", group: "answerable", label: "Structured data (schema.org)", source: "auto" },
  { key: "faq", group: "answerable", label: "FAQ section", source: "auto" },
  { key: "llms_txt", group: "answerable", label: "llms.txt file", source: "auto", hint: "A short plain-text summary at /llms.txt that AI tools can read." },
  { key: "one_liner", group: "answerable", label: "One clear line: what it is, who it's for", source: "self", hint: "On the homepage, near the top." },
  { key: "directories", group: "answerable", label: "Listed on 2+ directories or review sites", source: "self" },

  { key: "social_profiles", group: "social", label: "Profiles on the platforms your audience uses", source: "self" },
  { key: "bio_link", group: "social", label: "Bio with a link to the site", source: "self" },
  { key: "six_posts", group: "social", label: "At least 6 posts on the main platform", source: "self" },
  { key: "posting_rhythm", group: "social", label: "Posting rhythm chosen (e.g. 2 a week)", source: "self" },

  { key: "analytics", group: "measured", label: "Analytics installed", source: "auto", hint: "Detects Google Analytics, Plausible, Umami, PostHog, Clarity, Fathom, Matomo and others." },
  { key: "success_action", group: "measured", label: 'One "success" action defined (signup, sale, lead)', source: "self" },
  { key: "numbers_flowing", group: "measured", label: "Numbers reaching SIPE in the last 30 days", source: "derived", hint: "From the push link or a snapshot." },
  { key: "money_linked", group: "measured", label: "Money in is linked to the project", source: "derived", hint: "Income, a payment link or an invoice tagged to this project." },
  { key: "lead_capture", group: "measured", label: "Email list or waitlist collecting", source: "self" },

  { key: "contact", group: "reachable", label: "Visible way to contact you", source: "self", hint: "Form, WhatsApp or email." },
  { key: "feedback", group: "reachable", label: "A way for users to give feedback", source: "self" },
  { key: "costs_recorded", group: "reachable", label: "Running costs recorded in SIPE", source: "derived", hint: "An expense or bill tagged to this project." },
  { key: "access_written", group: "reachable", label: "Who holds what written down", source: "self", hint: "Domain, hosting and payment logins: who has them." },
];

const WRAPUP: BaselineItemDef[] = [
  { key: "final_invoice", group: "wrapup", label: "Final invoice paid", source: "self" },
  { key: "testimonial", group: "wrapup", label: "Testimonial asked for", source: "self" },
  { key: "case_study", group: "wrapup", label: "Case study or portfolio entry written", source: "self" },
  { key: "referral", group: "wrapup", label: "Referral asked for", source: "self" },
  { key: "lesson", group: "wrapup", label: "One lesson written down", source: "self" },
];

export function baselineTemplate(type: ProjectType): BaselineItemDef[] {
  if (type === "client") return WRAPUP;
  let items = [...STANDARD];
  const add = (after: string, extra: BaselineItemDef[]) => {
    const i = items.findIndex((x) => x.key === after);
    items.splice(i + 1, 0, ...extra);
  };
  if (type === "content") {
    items = items.map((x) => (x.key === "posting_rhythm" ? { ...x, label: "At least 1 article a week" } : x));
    add("directories", [{ key: "ranking_pages", group: "answerable", label: "5 pages ranking for a search term", source: "self" }]);
  }
  if (type === "shop") {
    add("lead_capture", [
      { key: "test_purchase", group: "measured", label: "A test purchase works end to end", source: "self" },
      { key: "mpesa_checkout", group: "measured", label: "M-Pesa checkout", source: "self" },
    ]);
    add("schema", [{ key: "product_schema", group: "answerable", label: "Product structured data", source: "self" }]);
    add("feedback", [{ key: "delivery_returns", group: "reachable", label: "Delivery and returns info", source: "self" }]);
  }
  if (type === "mobile") {
    items = items.filter((x) => x.key !== "sitemap" && x.key !== "robots");
    add("search_console", [
      { key: "store_listing", group: "findable", label: "Store listing with screenshots", source: "self" },
      { key: "store_links", group: "findable", label: "Landing page links to the stores", source: "self" },
      { key: "rating", group: "findable", label: "Store rating of 4 or more", source: "self" },
    ]);
  }
  if (type === "local") {
    add("search_console", [{ key: "google_business", group: "findable", label: "Google Business Profile", source: "self" }]);
    add("contact", [
      { key: "whatsapp_business", group: "reachable", label: "WhatsApp Business", source: "self" },
      { key: "hours_directions", group: "reachable", label: "Opening hours and directions on the site", source: "self" },
    ]);
  }
  return items;
}

export interface BaselineScore {
  done: number;
  total: number;
  pct: number;
  groups: { group: BaselineGroup; done: number; total: number }[];
  measuredComplete: boolean;
  readyForBackground: boolean;
  missing: BaselineItemDef[];
}

export const BACKGROUND_THRESHOLD = 0.8;

/** Items marked "not for this project" stop counting. Unknown counts as not done. */
export function baselineScore(defs: BaselineItemDef[], status: Record<string, ItemStatus | undefined>): BaselineScore {
  const counted = defs.filter((d) => status[d.key] !== "na");
  const done = counted.filter((d) => status[d.key] === "pass");
  const groups = BASELINE_GROUPS
    .map((g) => {
      const inG = counted.filter((d) => d.group === g.key);
      return { group: g.key, done: inG.filter((d) => status[d.key] === "pass").length, total: inG.length };
    })
    .filter((g) => g.total > 0);
  const measured = counted.filter((d) => d.group === "measured");
  const measuredComplete = measured.every((d) => status[d.key] === "pass");
  const pct = counted.length ? done.length / counted.length : 0;
  return {
    done: done.length,
    total: counted.length,
    pct,
    groups,
    measuredComplete,
    readyForBackground: pct >= BACKGROUND_THRESHOLD && measuredComplete,
    missing: counted.filter((d) => status[d.key] !== "pass"),
  };
}

/** Items SIPE can answer from its own data. `money` is null when the viewer can't see project money. */
export function derivedStatuses(
  metrics: Pick<MetricRow, "on_date" | "source">[],
  money: ProjectMoney | null,
  today: string,
): Record<string, ItemStatus> {
  const recent = metrics.some((m) => m.source !== "auto" && daysBetween(m.on_date, today) <= 30);
  const out: Record<string, ItemStatus> = { numbers_flowing: recent ? "pass" : "fail" };
  if (money && money.shared) {
    out.money_linked = (money.income_all ?? 0) > 0 ? "pass" : "fail";
    out.costs_recorded = (money.costs_all ?? 0) > 0 || (money.bills_monthly ?? 0) > 0 ? "pass" : "fail";
  } else {
    out.money_linked = "unknown";
    out.costs_recorded = "unknown";
  }
  return out;
}

/** Merge stored rows with derived answers into one status map. User "na" always wins. */
export function statusMap(
  defs: BaselineItemDef[],
  rows: Pick<BaselineRow, "key" | "status">[],
  derived: Record<string, ItemStatus>,
): Record<string, ItemStatus> {
  const stored = new Map(rows.map((r) => [r.key, r.status]));
  const out: Record<string, ItemStatus> = {};
  for (const d of defs) {
    const s = stored.get(d.key);
    if (s === "na") out[d.key] = "na";
    else if (d.source === "derived") out[d.key] = derived[d.key] ?? "unknown";
    else out[d.key] = s ?? (d.source === "self" ? "fail" : "unknown");
  }
  return out;
}

/** Self-reported items are re-confirmed every 90 days. */
export function needsReconfirm(row: Pick<BaselineRow, "source" | "status" | "confirmed_at">, today: string): boolean {
  return row.source === "self" && row.status === "pass" && !!row.confirmed_at && daysBetween(row.confirmed_at, today) > 90;
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------
export type Pace = "hit" | "on_pace" | "behind" | "far_behind";

export interface CycleProgress {
  day: number;
  totalDays: number;
  daysLeft: number;
  expected: number;
  pace: Pace;
  halfwayDue: boolean;
  ended: boolean;
}

export const PACE_LABEL: Record<Pace, string> = {
  hit: "Goal reached",
  on_pace: "On pace",
  behind: "Behind",
  far_behind: "Far behind",
};

export function cycleProgress(
  c: Pick<Cycle, "starts_on" | "ends_on" | "target" | "start_value" | "halfway_choice" | "status">,
  current: number | null,
  today: string,
): CycleProgress {
  const totalDays = Math.max(1, daysBetween(c.starts_on, c.ends_on));
  const day = Math.min(totalDays, Math.max(0, daysBetween(c.starts_on, today)));
  const timeRatio = day / totalDays;
  const span = c.target - c.start_value;
  const expected = c.start_value + span * timeRatio;
  const value = current ?? c.start_value;
  let pace: Pace;
  if (span > 0 ? value >= c.target : value <= c.target) pace = "hit";
  else if (timeRatio < 0.1 || span === 0) pace = "on_pace";
  else {
    const ratio = (value - c.start_value) / (expected - c.start_value);
    pace = ratio >= 0.9 ? "on_pace" : ratio >= 0.6 ? "behind" : "far_behind";
  }
  const ended = c.status === "active" && daysBetween(c.ends_on, today) >= 0;
  return {
    day,
    totalDays,
    daysLeft: Math.max(0, daysBetween(today, c.ends_on)),
    expected,
    pace,
    halfwayDue: c.status === "active" && !ended && !c.halfway_choice && timeRatio >= 0.5,
    ended,
  };
}

/** Hit = reached the target. Missed = below the stop rule (or under half the way there if no stop rule). */
export function verdictFor(c: Pick<Cycle, "target" | "start_value" | "stop_below">, result: number): Verdict {
  if (result >= c.target) return "hit";
  const floor = c.stop_below ?? c.start_value + (c.target - c.start_value) / 2;
  return result >= floor ? "partial" : "missed";
}

/** Latest value of a metric on or before `today`. */
export function latestValue(metrics: Pick<MetricRow, "metric" | "on_date" | "value">[], metric: string, today?: string): number | null {
  let best: { on_date: string; value: number } | null = null;
  for (const m of metrics) {
    if (m.metric !== metric) continue;
    if (today && m.on_date > today) continue;
    if (!best || m.on_date > best.on_date) best = m;
  }
  return best ? Number(best.value) : null;
}

/** The goal's current value: the newest of the metric's numbers and check-in numbers. */
export function currentGoalValue(
  cycle: Pick<Cycle, "metric" | "starts_on">,
  metrics: Pick<MetricRow, "metric" | "on_date" | "value">[],
  checkins: Pick<Checkin, "week_start" | "metric_value" | "created_at">[],
): number | null {
  let best: { at: string; v: number } | null = null;
  for (const m of metrics) {
    if (m.metric !== cycle.metric || m.on_date < cycle.starts_on) continue;
    if (!best || m.on_date > best.at) best = { at: m.on_date, v: Number(m.value) };
  }
  for (const c of checkins) {
    if (c.metric_value === null || c.metric_value === undefined) continue;
    const at = c.created_at.slice(0, 10);
    if (at < cycle.starts_on) continue;
    if (!best || at > best.at) best = { at, v: Number(c.metric_value) };
  }
  return best ? best.v : null;
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------
export function growBuildCounts(items: CheckinItem[]) {
  const done = items.filter((i) => i.done && i.text.trim());
  return { grow: done.filter((i) => i.tag === "grow").length, build: done.filter((i) => i.tag === "build").length };
}

/**
 * How many of the latest check-in weeks in a row had work done but no growth
 * work, across the whole team. Only weeks within the last 5 count, so an old
 * streak doesn't keep nagging.
 */
export function buildOnlyStreak(checkins: Pick<Checkin, "week_start" | "items">[], today: string): number {
  const byWeek = new Map<string, CheckinItem[]>();
  for (const c of checkins) byWeek.set(c.week_start, [...(byWeek.get(c.week_start) ?? []), ...(c.items ?? [])]);
  const weeks = [...byWeek.keys()].filter((w) => daysBetween(w, today) <= 35).sort().reverse();
  let streak = 0;
  for (const w of weeks) {
    const { grow, build } = growBuildCounts(byWeek.get(w)!);
    if (grow > 0) break;
    if (build > 0) streak++;
  }
  return streak;
}
export const BUILD_ONLY_WEEKS = 3;

/** Unfinished items from last week's plan, carried into this week's check-in. */
export function carryOverPlan(prev: Pick<Checkin, "next_plan"> | null | undefined): CheckinItem[] {
  if (!prev?.next_plan) return [];
  return prev.next_plan
    .split(/\n|·|;/)
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((text) => ({ text, tag: "grow" as const, done: false }));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function moneySummary(m: ProjectMoney | null, sharePct: number | null, myHours: number) {
  if (!m || !m.shared) return null;
  const share = sharePct === null || sharePct === undefined ? 1 : Number(sharePct) / 100;
  const income = Number(m.income_all ?? 0);
  const costs = Number(m.costs_all ?? 0);
  const myShare = income * share;
  const myCosts = costs * share;
  const net = myShare - myCosts;
  return {
    income,
    costs,
    myShare,
    myCosts,
    net,
    income90: Number(m.income_90d ?? 0),
    costs90: Number(m.costs_90d ?? 0),
    billsMonthly: Number(m.bills_monthly ?? 0),
    openInvoices: Number(m.documents_open ?? 0),
    perHour: myHours > 0 ? net / myHours : null,
  };
}

// ---------------------------------------------------------------------------
// What needs you
// ---------------------------------------------------------------------------
export type AttentionKind =
  | "set_goal" | "checkin_due" | "checkin_late" | "halfway" | "cycle_ended" | "build_only"
  | "site_down" | "domain_expiring" | "https_broken" | "gone_quiet" | "baseline_low" | "set_launch_date";

export interface ProjectAttention {
  kind: AttentionKind;
  projectId: string;
  projectName: string;
  text: string;
  tone: "due" | "risk";
  rank: number;
}

export interface AttentionInput {
  project: Pick<Project, "id" | "name" | "stage" | "launch_date" | "stage_changed_at" | "killed_at" | "type">;
  role: Role;
  mode: Mode;
  userId: string;
  cycle: Pick<Cycle, "starts_on" | "ends_on" | "target" | "start_value" | "halfway_choice" | "status"> | null;
  checkins: Pick<Checkin, "user_id" | "week_start" | "items">[];
  baselineRows: Pick<BaselineRow, "key" | "status" | "detail">[];
  baselinePct: number | null;
  metrics: Pick<MetricRow, "on_date" | "source">[];
  goalValue: number | null;
}

const RANK: Record<AttentionKind, number> = {
  site_down: 0, domain_expiring: 1, https_broken: 2, cycle_ended: 3, checkin_late: 4, checkin_due: 5,
  halfway: 6, build_only: 7, set_goal: 8, gone_quiet: 9, baseline_low: 10, set_launch_date: 11,
};

export function projectAttention(i: AttentionInput, today: string): ProjectAttention[] {
  const { project: p } = i;
  if (p.killed_at) return [];
  const out: ProjectAttention[] = [];
  const push = (kind: AttentionKind, text: string, tone: "due" | "risk") =>
    out.push({ kind, projectId: p.id, projectName: p.name, text, tone, rank: RANK[kind] });
  const row = (k: string) => i.baselineRows.find((r) => r.key === k);

  // Site problems matter in every mode except Parked, and a lapsing domain matters even then.
  const domain = row("domain");
  if (domain?.status === "fail" && domain.detail) push("domain_expiring", `${p.name}: ${domain.detail}`, "risk");
  if (i.mode !== "parked") {
    if (row("uptime")?.status === "fail") push("site_down", `${p.name}'s site isn't loading`, "risk");
    if (row("https")?.status === "fail") push("https_broken", `${p.name}'s secure connection (HTTPS) is broken`, "risk");
  }

  if (i.mode === "focus") {
    if (p.stage === "building" && !p.launch_date && daysBetween(p.stage_changed_at.slice(0, 10), today) >= 70) {
      push("set_launch_date", `${p.name} has been in Building for 10 weeks. Set a launch date?`, "due");
    }
    if (!i.cycle && canEdit(i.role) && p.stage !== "idea") push("set_goal", `Set a 90-day goal for ${p.name}`, "due");
    if (i.cycle) {
      const prog = cycleProgress(i.cycle, i.goalValue, today);
      if (prog.ended && canEdit(i.role)) push("cycle_ended", `${p.name}'s cycle has ended. Time to review it`, "due");
      else if (prog.halfwayDue && canEdit(i.role)) push("halfway", `Halfway check on ${p.name}: keep the plan or change it?`, "due");
    }
    if (canCheckIn(i.role)) {
      const mine = new Set(i.checkins.filter((c) => c.user_id === i.userId).map((c) => c.week_start));
      const thisWeek = weekStart(today);
      const lastWeek = addDays(thisWeek, -7);
      const dow = isoWeekday(today);
      if (!mine.has(thisWeek)) {
        if (dow >= 5) push("checkin_due", `${p.name} check-in due (3 min)`, "due");
        else if (!mine.has(lastWeek) && dow <= 3 && i.checkins.some((c) => c.user_id === i.userId)) {
          push("checkin_late", `Last week's ${p.name} check-in is missing`, "due");
        }
      }
    }
    if (isLive(p.stage) && buildOnlyStreak(i.checkins, today) >= BUILD_ONLY_WEEKS) {
      push("build_only", `${BUILD_ONLY_WEEKS} weeks of building only on ${p.name}. What's one thing that reaches a customer this week?`, "due");
    }
  }

  if (i.mode === "background") {
    const lastNumber = i.metrics.filter((m) => m.source !== "auto").map((m) => m.on_date).sort().pop();
    if (!lastNumber || daysBetween(lastNumber, today) > 30) push("gone_quiet", `${p.name} has gone quiet: no numbers for 30 days`, "risk");
    if (i.baselinePct !== null && i.baselinePct < BACKGROUND_THRESHOLD) {
      push("baseline_low", `${p.name}'s baseline is at ${Math.round(i.baselinePct * 100)}%`, "risk");
    }
  }

  return out.sort((a, b) => a.rank - b.rank);
}

// ---------------------------------------------------------------------------
// Modules (focused view)
// ---------------------------------------------------------------------------
export type ModuleKey = "money" | "goals" | "debts" | "invoicing" | "projects";

export const MODULES: { key: ModuleKey; label: string; blurb: string; routes: string[] }[] = [
  { key: "projects", label: "Projects", blurb: "Track projects with your team, 90-day goals and weekly check-ins.", routes: ["/projects"] },
  { key: "money", label: "Money & buckets", blurb: "Split every payment into Savings, Investments, Pay and Expenses.", routes: ["/dashboard", "/transactions", "/accounts", "/analytics", "/links"] },
  { key: "invoicing", label: "Quotes & invoices", blurb: "Quote and bill clients, see who needs chasing.", routes: ["/quotes", "/invoices", "/clients"] },
  { key: "goals", label: "Goals", blurb: "Save toward something specific, with a date.", routes: ["/goals"] },
  { key: "debts", label: "Debts", blurb: "Track what you owe and what you're owed.", routes: ["/debts"] },
];

/** null / undefined = everything on (everyone who signed up directly). */
export function moduleEnabled(enabled: string[] | null | undefined, key: ModuleKey): boolean {
  return !enabled || enabled.includes(key);
}

export function moduleForPath(path: string): ModuleKey | null {
  for (const m of MODULES) if (m.routes.some((r) => path === r || path.startsWith(`${r}/`))) return m.key;
  return null;
}

/** Where to land when the requested page belongs to a module that's off. */
export function homePath(enabled: string[] | null | undefined): string {
  if (moduleEnabled(enabled, "money")) return "/dashboard";
  const first = MODULES.find((m) => moduleEnabled(enabled, m.key));
  return first?.routes[0] ?? "/settings";
}
