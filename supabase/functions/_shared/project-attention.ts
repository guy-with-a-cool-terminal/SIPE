// "Projects this week" for the weekly email: the server-side subset of
// projectAttention() in src/lib/projects.ts. Keep the wording in step with it.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { APP_URL, EMAIL } from "./email.ts";

export interface ProjectLine { projectId: string; text: string; risk: boolean; rank: number }

const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / 86_400_000);
const addDays = (iso: string, n: number) => new Date(parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const weekStart = (iso: string) => addDays(iso, -((new Date(parse(iso)).getUTCDay() + 6) % 7));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Item { text: string; tag: string; done: boolean }

export async function projectAttention(db: SupabaseClient, userId: string, today: string): Promise<ProjectLine[]> {
  const { data: mem } = await db.from("project_members")
    .select("project_id, role, mode, project:projects(id, name, stage, killed_at)")
    .eq("user_id", userId).eq("status", "active");
  const rows = ((mem ?? []) as unknown as { project_id: string; role: string; mode: string; project: { id: string; name: string; stage: string; killed_at: string | null } }[])
    .filter((m) => m.project && !m.project.killed_at);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.project_id);

  const [cycles, baseline, checkins, metrics] = await Promise.all([
    db.from("project_cycles").select("project_id, starts_on, ends_on, halfway_choice").in("project_id", ids).eq("status", "active"),
    db.from("project_baseline_items").select("project_id, key, status, detail").in("project_id", ids).in("key", ["uptime", "https", "domain"]),
    db.from("project_checkins").select("project_id, user_id, week_start, items").in("project_id", ids).gte("week_start", addDays(today, -42)),
    db.from("project_metrics").select("project_id, on_date, source").in("project_id", ids).neq("source", "auto").gte("on_date", addDays(today, -31)),
  ]);

  const out: ProjectLine[] = [];
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  for (const r of rows) {
    const p = r.project;
    const push = (text: string, risk: boolean, rank: number) => out.push({ projectId: p.id, text, risk, rank });
    const b = (k: string) => (baseline.data ?? []).find((x: { project_id: string; key: string }) => x.project_id === p.id && x.key === k) as { status: string; detail: string | null } | undefined;
    const domain = b("domain");
    if (domain?.status === "fail" && domain.detail) push(`${p.name}: ${domain.detail}`, true, 1);
    if (r.mode !== "parked") {
      if (b("uptime")?.status === "fail") push(`${p.name}'s site isn't loading`, true, 0);
      if (b("https")?.status === "fail") push(`${p.name}'s secure connection (HTTPS) is broken`, true, 2);
    }
    const editor = r.role === "owner" || r.role === "cofounder";
    const worker = editor || r.role === "contributor";
    const pc = (checkins.data ?? []).filter((c: { project_id: string }) => c.project_id === p.id) as { user_id: string; week_start: string; items: Item[] }[];

    if (r.mode === "focus") {
      const cycle = (cycles.data ?? []).find((c: { project_id: string }) => c.project_id === p.id) as { starts_on: string; ends_on: string; halfway_choice: string | null } | undefined;
      if (!cycle && editor && p.stage !== "idea") push(`Set a 90-day goal for ${p.name}`, false, 8);
      if (cycle && editor) {
        const total = Math.max(1, daysBetween(cycle.starts_on, cycle.ends_on));
        const day = daysBetween(cycle.starts_on, today);
        if (day >= total) push(`${p.name}'s cycle has ended. Time to review it`, false, 3);
        else if (!cycle.halfway_choice && day / total >= 0.5) push(`Halfway check on ${p.name}: keep the plan or change it?`, false, 6);
      }
      if (worker) {
        const mine = new Set(pc.filter((c) => c.user_id === userId).map((c) => c.week_start));
        if (mine.size > 0 && !mine.has(lastWeek) && !mine.has(thisWeek)) push(`Last week's ${p.name} check-in is missing`, false, 4);
      }
      if (["launched", "growing", "sustaining"].includes(p.stage)) {
        const byWeek = new Map<string, Item[]>();
        for (const c of pc) byWeek.set(c.week_start, [...(byWeek.get(c.week_start) ?? []), ...(c.items ?? [])]);
        let streak = 0;
        for (const w of [...byWeek.keys()].filter((w) => daysBetween(w, today) <= 35).sort().reverse()) {
          const done = byWeek.get(w)!.filter((i) => i.done && i.text?.trim());
          if (done.some((i) => i.tag === "grow")) break;
          if (done.length) streak++;
        }
        if (streak >= 3) push(`3 weeks of building only on ${p.name}. What's one thing that reaches a customer this week?`, false, 7);
      }
    }
    if (r.mode === "background") {
      const recent = (metrics.data ?? []).some((m: { project_id: string; on_date: string }) => m.project_id === p.id && daysBetween(m.on_date, today) <= 30);
      if (!recent) push(`${p.name} has gone quiet: no numbers for 30 days`, true, 9);
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/** "Projects this week" section. Empty string when nothing needs attention. */
export function projectAttentionHtml(lines: ProjectLine[]): string {
  if (!lines.length) return "";
  const rows = lines.slice(0, 5).map((l) => `
      <tr><td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};${l.risk ? `color:${EMAIL.bad}` : ""}">
        <a href="${APP_URL}/projects/${l.projectId}" style="color:inherit;text-decoration:none">${esc(l.text)}</a>
      </td></tr>`).join("");
  const more = lines.length > 5 ? `<p style="margin:8px 0 0;font-size:12px;color:${EMAIL.textDim}">and ${lines.length - 5} more</p>` : "";
  return `
    <div style="margin-top:24px">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:${EMAIL.text}">Projects this week</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:${EMAIL.text}">${rows}</table>
      ${more}
      <p style="margin:12px 0 0;font-size:13px"><a href="${APP_URL}/projects" style="color:${EMAIL.brand}">Open Projects</a></p>
    </div>`;
}
