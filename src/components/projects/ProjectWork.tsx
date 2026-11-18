import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  addDays, BUILD_ONLY_WEEKS, buildOnlyStreak, canCheckIn, canEdit, cycleProgress, growBuildCounts, isLive,
  metricLabel, todayISO, weekStart,
  type Checkin, type Cycle, type Decision, type ProjectAttention, type TeamMember,
} from "@/lib/projects";
import type { ProjectData } from "@/hooks/useProjects";
import { useInvalidateProjects } from "@/hooks/useProjects";
import { Bar, dbMessage, fmtDate, fmtNum, linkBtn, PaceText, primaryBtn, secondaryBtn, Section } from "./bits";
import { CheckinModal } from "./CheckinModal";
import { CycleModal, CycleReviewModal } from "./CycleModals";

export const nameOf = (team: TeamMember[], userId: string, me?: string) => {
  if (userId === me) return "You";
  const t = team.find((x) => x.user_id === userId);
  return t?.full_name?.trim() || t?.email.split("@")[0] || "Someone";
};

/** Goal line: actual values over the cycle, and the straight line to the target. */
const GoalChart = ({ cycle, points }: { cycle: Cycle; points: { date: string; value: number }[] }) => {
  const W = 320, H = 90, pad = 4;
  const total = Math.max(1, (Date.parse(cycle.ends_on) - Date.parse(cycle.starts_on)) / 86_400_000);
  const vals = [cycle.start_value, cycle.target, ...points.map((p) => p.value)];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (d: string) => pad + ((Date.parse(d) - Date.parse(cycle.starts_on)) / 86_400_000 / total) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * pad);
  const line = [{ date: cycle.starts_on, value: cycle.start_value }, ...points].map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Progress toward the goal">
        <line x1={x(cycle.starts_on)} y1={y(cycle.start_value)} x2={x(cycle.ends_on)} y2={y(cycle.target)} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {points.length > 0 && <polyline points={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="text-xs text-muted-foreground">Green: actual. Dashed: the pace needed.</figcaption>
    </figure>
  );
};

export const OverviewTab = ({ d, attention, readyForBackground, onDecided, onOpenCheckin }: {
  d: ProjectData;
  attention: ProjectAttention[];
  readyForBackground: boolean;
  onDecided: (dec: Decision) => void;
  onOpenCheckin: () => void;
}) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const { project: p, me, cycles, checkins, metrics, team } = d;
  const today = todayISO();
  const cycle = cycles.find((c) => c.status === "active") ?? null;
  const editable = canEdit(me.role);
  const [startOpen, setStartOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newPlan, setNewPlan] = useState("");

  const goalPoints = cycle ? [
    ...metrics.filter((m) => m.metric === cycle.metric && m.on_date >= cycle.starts_on).map((m) => ({ date: m.on_date, value: Number(m.value) })),
    ...checkins.filter((c) => c.metric_value != null && c.created_at.slice(0, 10) >= cycle.starts_on).map((c) => ({ date: c.created_at.slice(0, 10), value: Number(c.metric_value) })),
  ].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const goalValue = goalPoints.length ? goalPoints[goalPoints.length - 1].value : null;
  const prog = cycle ? cycleProgress(cycle, goalValue, today) : null;

  const halfway = async (choice: "keep" | "change") => {
    if (!cycle) return;
    const patch: Record<string, unknown> = { halfway_choice: choice };
    if (choice === "change") {
      if (!newPlan.trim()) return toast.error("Write the new plan in one sentence");
      patch.halfway_note = `Was: ${cycle.plan ?? "(no plan written)"}`;
      patch.plan = newPlan.trim();
    }
    const { error } = await supabase.from("project_cycles").update(patch).eq("id", cycle.id);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    setChanging(false);
    toast.success(choice === "keep" ? "Keeping the plan" : "Plan changed for the rest of the cycle");
  };

  // this week, across the team
  const thisWeek = weekStart(today);
  const weekRows = checkins.filter((c) => c.week_start === thisWeek);
  const workers = team.filter((t) => t.status === "active" && t.user_id && canCheckIn(t.role));
  const streak = isLive(p.stage) ? buildOnlyStreak(checkins, today) : 0;
  const recentWeeks = [0, 1, 2, 3].map((i) => addDays(thisWeek, -7 * i)).reverse();

  return (
    <div className="space-y-5">
      {attention.length > 0 && (
        <ul className="space-y-2">
          {attention.map((a) => (
            <li key={a.kind} className={cn("rounded-xl border px-4 py-3 text-sm", a.tone === "risk" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5")}>
              {a.text}
            </li>
          ))}
        </ul>
      )}

      {(p.north_star || p.one_liner) && (
        <Section title="North Star">
          {p.north_star ? <p className="text-sm">{p.north_star}</p> : <p className="text-sm text-muted-foreground">Not set yet.</p>}
          {p.north_star_metric && p.north_star_target != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              {metricLabel(p.north_star_metric)}: target {fmtNum(p.north_star_target)}
            </p>
          )}
        </Section>
      )}

      <Section
        title={cycle ? `Cycle ${cycle.n}` : "90-day goal"}
        action={cycle && editable && <span className="text-xs text-muted-foreground">{fmtDate(cycle.starts_on)} to {fmtDate(cycle.ends_on)}</span>}
      >
        {!cycle ? (
          <div>
            <p className="text-sm text-muted-foreground">
              {p.stage === "idea"
                ? "Ideas don't need a goal yet. Move it to Building when you start."
                : "One number, one date, one plan, and a stop rule. Set it with your co-founders."}
            </p>
            {editable && p.stage !== "idea" && (
              <button onClick={() => setStartOpen(true)} className={cn(primaryBtn, "mt-4")}>Start a 90-day cycle</button>
            )}
            {cycles[0]?.status === "closed" && (
              <p className="mt-3 text-xs text-muted-foreground">
                Last cycle: {metricLabel(cycles[0].metric)} {fmtNum(cycles[0].result)} of {fmtNum(cycles[0].target)} ({cycles[0].verdict}).
                {cycles[0].lesson && <> Lesson: "{cycles[0].lesson}"</>}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-2xl font-bold tabular-nums">{fmtNum(goalValue ?? cycle.start_value)}</span>
                <span className="text-muted-foreground"> of {fmtNum(cycle.target)} {metricLabel(cycle.metric).toLowerCase()}</span>
              </p>
              {prog && <p className="text-sm"><PaceText pace={prog.pace} /> <span className="text-muted-foreground">· day {prog.day} of {prog.totalDays}</span></p>}
            </div>
            <Bar
              className="mt-3"
              value={(Number(goalValue ?? cycle.start_value) - cycle.start_value) / Math.max(1e-9, cycle.target - cycle.start_value)}
              tone={prog?.pace === "far_behind" ? "destructive" : prog?.pace === "behind" ? "warning" : "primary"}
            />
            {cycle.plan && <p className="mt-3 text-sm"><span className="text-muted-foreground">Plan:</span> {cycle.plan}</p>}
            {cycle.stop_below != null && (
              <p className="mt-1 text-xs text-muted-foreground">Stop rule: below {fmtNum(cycle.stop_below)} by {fmtDate(cycle.ends_on)} means {cycle.stop_action === "change" ? "changing the approach" : cycle.stop_action === "background" ? "moving it to Background" : cycle.stop_action === "park" ? "parking it" : "stopping it"}.</p>
            )}
            <GoalChart cycle={cycle} points={goalPoints} />

            {prog?.halfwayDue && editable && (
              <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm font-medium">Halfway check: <PaceText pace={prog.pace} /></p>
                <p className="mt-1 text-sm text-muted-foreground">Keep the plan, or change it now? Changing at halfway is better than finding out at day 90.</p>
                {changing ? (
                  <div className="mt-3 space-y-2">
                    <textarea value={newPlan} onChange={(e) => setNewPlan(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-input px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm" placeholder="The new plan, in one sentence" />
                    <div className="flex gap-2"><button onClick={() => halfway("change")} className={primaryBtn}>Save new plan</button><button onClick={() => setChanging(false)} className={secondaryBtn}>Cancel</button></div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => halfway("keep")} className={primaryBtn}>Keep the plan</button>
                    <button onClick={() => { setNewPlan(cycle.plan ?? ""); setChanging(true); }} className={secondaryBtn}>Change it</button>
                  </div>
                )}
              </div>
            )}
            {cycle.halfway_choice && (
              <p className="mt-3 text-xs text-muted-foreground">Halfway: {cycle.halfway_choice === "keep" ? "kept the plan" : `changed the plan. ${cycle.halfway_note ?? ""}`}</p>
            )}
            {prog?.ended && editable && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">This cycle has ended.</p>
                <p className="mt-1 text-sm text-muted-foreground">Compare the result with the goal and decide what's next.</p>
                <button onClick={() => setReviewOpen(true)} className={cn(primaryBtn, "mt-3")}>Review cycle {cycle.n}</button>
              </div>
            )}
          </div>
        )}
      </Section>

      {(me.mode === "focus" || weekRows.length > 0) && (
        <Section
          title="This week"
          action={canCheckIn(me.role) && <button onClick={onOpenCheckin} className={linkBtn}>{weekRows.some((c) => c.user_id === user?.id) ? "Edit my check-in" : "Check in →"}</button>}
        >
          <ul className="divide-y divide-border">
            {workers.map((t) => {
              const c = weekRows.find((r) => r.user_id === t.user_id);
              const gb = c ? growBuildCounts(c.items) : null;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{nameOf(team, t.user_id!, user?.id)}</span>
                  {c ? (
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{gb!.grow} grow · {gb!.build} build</span>
                      {c.confidence && <span className="font-medium text-foreground">{c.confidence}/5</span>}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">Not yet</span>}
                </li>
              );
            })}
          </ul>
          {(() => {
            const conf = weekRows.map((c) => c.confidence).filter((x): x is number => x != null);
            return conf.length >= 2 && Math.max(...conf) - Math.min(...conf) >= 2 ? (
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs">Confidence ranges from {Math.min(...conf)} to {Math.max(...conf)} this week. A gap like that is worth a conversation now.</p>
            ) : null;
          })()}
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-muted-foreground">Build vs grow, last 4 weeks</p>
            <div className="grid grid-cols-4 gap-2">
              {recentWeeks.map((w) => {
                const items = checkins.filter((c) => c.week_start === w).flatMap((c) => c.items);
                const gb = growBuildCounts(items);
                const total = gb.grow + gb.build;
                return (
                  <div key={w} className="text-center">
                    <div className="flex h-10 overflow-hidden rounded-md bg-secondary">
                      {total > 0 && <div className="bg-primary" style={{ width: `${(gb.grow / total) * 100}%` }} />}
                      {total > 0 && <div className="bg-muted-foreground/30" style={{ width: `${(gb.build / total) * 100}%` }} />}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{fmtDate(w).replace(/ \d{4}$/, "")}</p>
                  </div>
                );
              })}
            </div>
            {streak >= BUILD_ONLY_WEEKS && (
              <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                {streak} weeks of building with no growth work. What's one thing this week that reaches a customer?
              </p>
            )}
          </div>
        </Section>
      )}

      {startOpen && <CycleModal open={startOpen} onClose={() => setStartOpen(false)} project={p} cycles={cycles} metrics={metrics} />}
      {cycle && (
        <CycleReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          cycle={cycle}
          current={goalValue}
          isOwner={me.role === "owner"}
          readyForBackground={readyForBackground}
          onDecided={(dec) => { onDecided(dec); if (dec === "continue" || dec === "change") setStartOpen(true); }}
        />
      )}
    </div>
  );
};

export const CheckinsTab = ({ d, onOpenCheckin }: { d: ProjectData; onOpenCheckin: () => void }) => {
  const { user } = useAuth();
  const { checkins, team, me } = d;
  const weeks = [...new Set(checkins.map((c) => c.week_start))].sort().reverse();
  return (
    <div className="space-y-4">
      {canCheckIn(me.role) && (
        <div className="flex justify-end"><button onClick={onOpenCheckin} className={primaryBtn}>Check in</button></div>
      )}
      {weeks.length === 0 && (
        <Section><p className="text-sm text-muted-foreground">No check-ins yet. Each week, everyone working on the project writes down what they planned, what they did, what got in the way and the number this week. About 3 minutes.</p></Section>
      )}
      {weeks.map((w) => (
        <Section key={w} title={`Week of ${fmtDate(w)}`}>
          <div className="space-y-4">
            {checkins.filter((c) => c.week_start === w).map((c) => <CheckinCard key={c.id} c={c} who={nameOf(team, c.user_id, user?.id)} />)}
          </div>
        </Section>
      ))}
    </div>
  );
};

const CheckinCard = ({ c, who }: { c: Checkin; who: string }) => (
  <div className="rounded-xl border border-border p-4">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm font-semibold">{who}</p>
      <p className="text-xs text-muted-foreground">
        {c.metric_value != null && <>Number: <span className="font-medium text-foreground">{fmtNum(c.metric_value)}</span> · </>}
        {c.hours != null && <>{fmtNum(c.hours)} h · </>}
        {c.confidence != null && <>Confidence {c.confidence}/5</>}
      </p>
    </div>
    {c.items.length > 0 && (
      <ul className="space-y-1 text-sm">
        {c.items.map((i, k) => (
          <li key={k} className="flex items-start gap-2">
            <span className={cn("mt-0.5 rounded px-1.5 text-[10px] font-semibold uppercase", i.tag === "grow" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{i.tag}</span>
            <span className={cn(!i.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{i.text}</span>
          </li>
        ))}
      </ul>
    )}
    {(c.blockers || c.actions) && (
      <p className="mt-2 text-sm text-muted-foreground">
        {c.blockers && <>Got in the way: {c.blockers}. </>}
        {c.actions && <>Did: {c.actions}.</>}
      </p>
    )}
    {c.next_plan && <p className="mt-2 text-xs text-muted-foreground">Next: {c.next_plan}</p>}
  </div>
);

export { CheckinModal };
