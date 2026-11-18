import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { rowProgress, useMyProjects, useProfileSettings, type ProjectRow } from "@/hooks/useProjects";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { Bar, fmtNum, PaceText, primaryBtn, RolePill, StagePill } from "@/components/projects/bits";
import { cn } from "@/lib/utils";
import { growBuildCounts, latestValue, metricLabel, weekStart, todayISO, addDays } from "@/lib/projects";

const FocusCard = ({ r }: { r: ProjectRow }) => {
  const prog = rowProgress(r);
  const lastWeek = r.checkins.filter((c) => c.week_start >= addDays(weekStart(todayISO()), -7)).flatMap((c) => c.items);
  const gb = growBuildCounts(lastWeek);
  const c = r.cycle;
  return (
    <Link to={`/projects/${r.project.id}`} className="glass block rounded-2xl p-5 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-semibold">{r.project.name}</p>
        <div className="flex flex-shrink-0 gap-1"><StagePill stage={r.project.stage} /><RolePill role={r.me.role} /></div>
      </div>
      {c ? (
        <>
          <p className="mt-1 truncate text-xs text-muted-foreground">Goal: {fmtNum(c.target)} {metricLabel(c.metric).toLowerCase()} by {c.ends_on}</p>
          <div className="mt-3 flex items-center gap-3">
            <Bar className="flex-1" value={((r.goalValue ?? c.start_value) - c.start_value) / Math.max(1e-9, c.target - c.start_value)}
              tone={prog?.pace === "far_behind" ? "destructive" : prog?.pace === "behind" ? "warning" : "primary"} />
            <span className="text-xs tabular-nums text-muted-foreground">{fmtNum(r.goalValue ?? c.start_value)} / {fmtNum(c.target)}</span>
          </div>
          <p className="mt-2 text-xs">{prog && <PaceText pace={prog.pace} />} <span className="text-muted-foreground">· {gb.grow} grow, {gb.build} build this week and last</span></p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{r.project.stage === "idea" ? "An idea. Move it to Building when you start." : "No 90-day goal yet."}</p>
      )}
    </Link>
  );
};

const healthDot = (r: ProjectRow) => {
  const bad = r.baselineRows.some((b) => (b.key === "uptime" || b.key === "https" || b.key === "domain") && b.status === "fail");
  if (bad) return "bg-destructive";
  if (r.score && r.score.pct < 0.8) return "bg-warning";
  return "bg-primary";
};

const Row = ({ r, showScore }: { r: ProjectRow; showScore?: boolean }) => {
  const key = r.project.north_star_metric ?? r.metrics.find((m) => m.source !== "auto")?.metric;
  const v = key ? latestValue(r.metrics, key) : null;
  return (
    <li>
      <Link to={`/projects/${r.project.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-secondary/20 sm:px-5">
        {showScore && <span className={cn("size-2 flex-shrink-0 rounded-full", healthDot(r))} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.project.one_liner ?? ""}</p>
        </div>
        {showScore && r.score && <span className="hidden text-xs text-muted-foreground sm:inline">Baseline {Math.round(r.score.pct * 100)}%</span>}
        {key && v !== null && <span className="text-xs tabular-nums text-muted-foreground">{fmtNum(v)} {metricLabel(key).toLowerCase()}</span>}
        <StagePill stage={r.project.stage} />
      </Link>
    </li>
  );
};

const Projects = () => {
  usePageTitle("Projects");
  const { rows, attention, isLoading, error } = useMyProjects();
  const { data: profile } = useProfileSettings();
  const [creating, setCreating] = useState(false);
  const [showStopped, setShowStopped] = useState(false);
  const cap = profile?.focus_cap ?? 2;

  const live = rows.filter((r) => !r.project.killed_at);
  const focus = live.filter((r) => r.me.mode === "focus");
  const background = live.filter((r) => r.me.mode === "background");
  const parked = live.filter((r) => r.me.mode === "parked");
  const stopped = rows.filter((r) => r.project.killed_at);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-24 sm:px-6 sm:pt-8 md:pb-10 lg:px-8 xl:px-12">
      <PageHeader
        title="Projects"
        subtitle={`Up to ${cap} in Focus. The rest run and measure themselves.`}
        actions={<button onClick={() => setCreating(true)} className={primaryBtn}><Plus className="size-4" /> New project</button>}
      />

      {isLoading ? (
        <CardGridSkeleton count={2} className="grid gap-4 sm:grid-cols-2" />
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-sm text-destructive">Couldn't load projects: {(error as Error).message}</div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold">Track what you build until it grows</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Add your products and client projects. Pick up to {cap} to focus on, with a 90-day goal and a 3-minute weekly check-in.
            The rest get a checklist so they keep running and measuring themselves while you're busy elsewhere.
          </p>
          <button onClick={() => setCreating(true)} className={cn(primaryBtn, "mt-5")}><Plus className="size-4" /> Add your first project</button>
        </div>
      ) : (
        <div className="space-y-8">
          {attention.length > 0 && (
            <section className="glass overflow-hidden rounded-2xl">
              <h2 className="px-4 pt-4 pb-2 text-base font-semibold sm:px-5">Needs you</h2>
              <ul className="divide-y divide-border">
                {attention.slice(0, 6).map((a) => (
                  <li key={`${a.projectId}-${a.kind}`}>
                    <Link to={`/projects/${a.projectId}`} className={cn("block px-4 py-2.5 text-sm transition hover:bg-secondary/20 sm:px-5", a.tone === "risk" && "text-destructive")}>
                      {a.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-base font-semibold">Focus <span className="text-sm font-normal text-muted-foreground">{focus.length} of {cap}</span></h2>
            <div className="grid gap-4 md:grid-cols-2">
              {focus.map((r) => <FocusCard key={r.project.id} r={r} />)}
              {Array.from({ length: Math.max(0, cap - focus.length) }).map((_, i) => (
                <div key={i} className="grid min-h-[8rem] place-items-center rounded-2xl border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Free Focus slot. Open a project and set it to Focus.
                </div>
              ))}
            </div>
          </section>

          {background.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold">Background</h2>
              <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">{background.map((r) => <Row key={r.project.id} r={r} showScore />)}</ul>
            </section>
          )}

          {parked.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold">Parked and ideas</h2>
              <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">{parked.map((r) => <Row key={r.project.id} r={r} />)}</ul>
            </section>
          )}

          {stopped.length > 0 && (
            <section>
              <button onClick={() => setShowStopped((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground">
                {showStopped ? "Hide" : "Show"} stopped ({stopped.length})
              </button>
              {showStopped && <ul className="glass mt-3 divide-y divide-border overflow-hidden rounded-2xl opacity-80">{stopped.map((r) => <Row key={r.project.id} r={r} />)}</ul>}
            </section>
          )}
        </div>
      )}

      <ProjectModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
};

export default Projects;
