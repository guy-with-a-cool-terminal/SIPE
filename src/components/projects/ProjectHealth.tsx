import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Minus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  AUTO_METRICS, BACKGROUND_THRESHOLD, BASELINE_GROUPS, canCheckIn, canEdit, daysBetween, metricLabel, needsReconfirm,
  todayISO, type BaselineItemDef, type BaselineScore, type ItemStatus,
} from "@/lib/projects";
import type { ProjectData } from "@/hooks/useProjects";
import { useInvalidateProjects } from "@/hooks/useProjects";
import { Bar, callFunction, dbMessage, fmtDate, fmtNum, linkBtn, primaryBtn, secondaryBtn, Section } from "./bits";
import { SnapshotModal } from "./SnapshotModal";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SOURCE_LABEL = { auto: "Checked daily", derived: "From SIPE", self: "You" } as const;

const StatusIcon = ({ s }: { s: ItemStatus }) =>
  s === "pass" ? <span className="grid size-5 flex-shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>
  : s === "fail" ? <span className="grid size-5 flex-shrink-0 place-items-center rounded-full border-2 border-warning/60" />
  : s === "na" ? <span className="grid size-5 flex-shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><Minus className="size-3.5" /></span>
  : <span className="grid size-5 flex-shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/40" />;

export const BaselineTab = ({ d, defs, statuses, score }: {
  d: ProjectData;
  defs: BaselineItemDef[];
  statuses: Record<string, ItemStatus>;
  score: BaselineScore;
}) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const { project: p, me, baseline } = d;
  const can = canCheckIn(me.role);
  const [checking, setChecking] = useState(false);
  const today = todayISO();
  const rowOf = (k: string) => baseline.find((b) => b.key === k);
  const lastAuto = baseline.filter((b) => b.source === "auto" && b.checked_at).map((b) => b.checked_at!).sort().pop();

  const setStatus = async (def: BaselineItemDef, status: ItemStatus) => {
    const { error } = await supabase.from("project_baseline_items").upsert({
      project_id: p.id, key: def.key, status, source: def.source === "auto" ? "auto" : "self",
      confirmed_at: status === "pass" ? new Date().toISOString() : null, confirmed_by: user?.id,
    }, { onConflict: "project_id,key" });
    if (error) return toast.error(dbMessage(error));
    invalidate();
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await callFunction<{ failing: string[] }>("project-health", { project_id: p.id });
      toast.success(r.failing?.length ? `Checked. ${r.failing.length} thing${r.failing.length > 1 ? "s" : ""} to fix.` : "Checked. All good.");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Baseline</p>
            <p className="text-3xl font-bold tabular-nums">{Math.round(score.pct * 100)}%</p>
            <p className="text-sm text-muted-foreground">
              {score.done} of {score.total} done ·{" "}
              {score.readyForBackground
                ? <span className="font-medium text-primary">ready for Background</span>
                : !score.measuredComplete
                  ? "Background needs every Measured item"
                  : `Background needs ${Math.round(BACKGROUND_THRESHOLD * 100)}%`}
            </p>
          </div>
          {p.url && can && p.type !== "client" && (
            <div className="text-right">
              <button onClick={checkNow} disabled={checking} className={secondaryBtn}>
                <RefreshCw className={cn("size-4", checking && "animate-spin")} /> {checking ? "Checking…" : "Check now"}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">{lastAuto ? `Last checked ${fmtDate(lastAuto)}` : "Not checked yet"}</p>
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {score.groups.map((g) => (
            <div key={g.group} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate">{BASELINE_GROUPS.find((x) => x.key === g.group)?.label.split(" ")[0]}</span>
              <Bar value={g.done / g.total} tone={g.done === g.total ? "primary" : "warning"} />
              <span className="text-right tabular-nums text-muted-foreground">{g.done}/{g.total}</span>
            </div>
          ))}
        </div>
        {!p.url && p.type !== "client" && (
          <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-sm">Add the project's web address in Settings and SIPE checks the site every day.</p>
        )}
      </Section>

      {BASELINE_GROUPS.map((g) => {
        const items = defs.filter((x) => x.group === g.key);
        if (items.length === 0) return null;
        return (
          <Section key={g.key} title={g.label} action={<span className="text-xs text-muted-foreground">{g.blurb}</span>}>
            <ul className="divide-y divide-border">
              {items.map((def) => {
                const s = statuses[def.key] ?? "unknown";
                const row = rowOf(def.key);
                const stale = row && needsReconfirm(row, today);
                return (
                  <li key={def.key} className="flex items-start gap-3 py-3">
                    <StatusIcon s={s} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", s === "na" && "text-muted-foreground line-through")}>{def.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row?.detail && def.source === "auto" ? row.detail : def.hint}
                        {s === "unknown" && def.source === "auto" && !row?.detail && " Not checked yet."}
                      </p>
                      {stale && <p className="mt-1 text-xs text-warning">Ticked {daysBetween(row!.confirmed_at!.slice(0, 10), today)} days ago. Still true?</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="hidden text-[11px] text-muted-foreground sm:inline">{SOURCE_LABEL[def.source]}</span>
                      {can && def.source === "self" && s !== "na" && (
                        <button onClick={() => setStatus(def, s === "pass" && !stale ? "fail" : "pass")} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", s === "pass" && !stale ? "border-border text-muted-foreground" : "border-primary text-primary hover:bg-primary/5")}>
                          {s === "pass" ? (stale ? "Still true" : "Undo") : "Done"}
                        </button>
                      )}
                      {can && (
                        <button onClick={() => setStatus(def, s === "na" ? (def.source === "self" ? "fail" : "unknown") : "na")} title={s === "na" ? "Count it again" : "Not for this project"} aria-label={s === "na" ? "Count it again" : "Not for this project"} className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                          {s === "na" ? <RefreshCw className="size-3.5" /> : <X className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </div>
  );
};

interface KeyRow { id: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

export const NumbersTab = ({ d }: { d: ProjectData }) => {
  const { project: p, me, metrics, cycles } = d;
  const invalidate = useInvalidateProjects();
  const [snapOpen, setSnapOpen] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const cycle = cycles.find((c) => c.status === "active") ?? null;
  const editable = canEdit(me.role);

  useEffect(() => {
    if (!editable) return;
    supabase.from("project_keys").select("id,prefix,created_at,last_used_at,revoked_at").eq("project_id", p.id).order("created_at", { ascending: false })
      .then(({ data }) => setKeys((data ?? []) as KeyRow[]));
  }, [editable, p.id, fresh]);

  const series = useMemo(() => {
    const by = new Map<string, { on_date: string; value: number; source: string }[]>();
    for (const m of metrics) {
      if (AUTO_METRICS.has(m.metric)) continue;
      by.set(m.metric, [...(by.get(m.metric) ?? []), { on_date: m.on_date, value: Number(m.value), source: m.source }]);
    }
    return [...by.entries()].map(([metric, rows]) => {
      const last = rows[rows.length - 1];
      const before = [...rows].reverse().find((r) => daysBetween(r.on_date, last.on_date) >= 28);
      return { metric, rows, last, change: before ? last.value - before.value : null };
    }).sort((a, b) => b.last.on_date.localeCompare(a.last.on_date));
  }, [metrics]);

  const createKey = async () => {
    const { data, error } = await supabase.rpc("create_project_key", { p_project: p.id });
    if (error) return toast.error(dbMessage(error));
    setFresh(data as string);
  };
  const revoke = async (id: string) => {
    const { error } = await supabase.from("project_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(dbMessage(error));
    setKeys((k) => k.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    invalidate();
  };
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success("Copied"));
  const example = `curl -X POST "${SUPABASE_URL}/functions/v1/project-metrics" \\
  -H "x-project-key: ${fresh ?? "pk_your_key"}" \\
  -H "content-type: application/json" \\
  -d '{ "metric": "signups", "value": 12 }'`;

  return (
    <div className="space-y-5">
      <Section title="Numbers" action={canCheckIn(me.role) && <button onClick={() => setSnapOpen(true)} className={primaryBtn}>Add numbers</button>}>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">No numbers yet. Add them by hand once a month, or send them automatically with a push link below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Number</th><th className="py-2 pr-3 text-right font-medium">Latest</th>
                <th className="py-2 pr-3 text-right font-medium">vs a month before</th><th className="py-2 pr-3 font-medium">Trend</th><th className="py-2 font-medium">As of</th>
              </tr></thead>
              <tbody>
                {series.map((s) => {
                  const vals = s.rows.slice(-12).map((r) => r.value);
                  const lo = Math.min(...vals), hi = Math.max(...vals);
                  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * 60},${16 - ((v - lo) / Math.max(1e-9, hi - lo)) * 14}`).join(" ");
                  return (
                    <tr key={s.metric} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3">{metricLabel(s.metric)}{cycle?.metric === s.metric && <span className="ml-2 text-[11px] text-primary">goal</span>}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{fmtNum(s.last.value)}</td>
                      <td className={cn("py-2.5 pr-3 text-right tabular-nums", s.change == null ? "text-muted-foreground" : s.change > 0 ? "text-primary" : s.change < 0 ? "text-destructive" : "")}>
                        {s.change == null ? "–" : `${s.change > 0 ? "+" : ""}${fmtNum(s.change)}`}
                      </td>
                      <td className="py-2.5 pr-3">{vals.length > 1 && <svg viewBox="0 0 60 18" className="h-4 w-16"><polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" /></svg>}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{fmtDate(s.last.on_date)} · {s.last.source === "push" ? "push" : "by hand"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {editable && (
        <Section title="Push link" action={<button onClick={createKey} className={linkBtn}><KeyRound className="mr-1 inline size-4" />New key</button>}>
          <p className="text-sm text-muted-foreground">
            Lets your app, a daily script, Zapier or Make send numbers to this project on its own. A key can only add numbers here. It can't read anything, and you can revoke it any time.
          </p>
          {fresh && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium">Copy this key now. It won't be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 text-xs">{fresh}</code>
                <button onClick={() => copy(fresh)} className={secondaryBtn}><Copy className="size-4" /> Copy</button>
              </div>
            </div>
          )}
          <div className="relative mt-4">
            <pre className="overflow-x-auto rounded-xl bg-foreground p-4 text-xs leading-relaxed text-background">{example}</pre>
            <button onClick={() => copy(example)} className="absolute right-2 top-2 rounded-lg bg-background/10 p-1.5 text-background hover:bg-background/20" aria-label="Copy example"><Copy className="size-4" /></button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Send one number, or up to 50 at once as {"{ \"metrics\": [...] }"}. Sending the same number and day again replaces it.</p>
          {keys.length > 0 && (
            <ul className="mt-4 divide-y divide-border text-sm">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                  <span className={cn("font-mono text-xs", k.revoked_at && "text-muted-foreground line-through")}>{k.prefix}…</span>
                  <span className="text-xs text-muted-foreground">{k.revoked_at ? "Revoked" : k.last_used_at ? `Last used ${fmtDate(k.last_used_at)}` : "Never used"}</span>
                  {!k.revoked_at && <button onClick={() => revoke(k.id)} className="text-xs font-medium text-destructive">Revoke</button>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <SnapshotModal open={snapOpen} onClose={() => setSnapOpen(false)} project={p} cycle={cycle} metrics={metrics} />
    </div>
  );
};
