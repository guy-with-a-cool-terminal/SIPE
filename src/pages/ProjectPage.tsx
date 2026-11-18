import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useInvalidateProjects, useProject, useProfileSettings } from "@/hooks/useProjects";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { cn } from "@/lib/utils";
import {
  baselineScore, baselineTemplate, canCheckIn, currentGoalValue, derivedStatuses, MODES, projectAttention, statusMap,
  todayISO, type Decision, type Mode,
} from "@/lib/projects";
import { dbMessage, ModePill, RolePill, StagePill } from "@/components/projects/bits";
import { CheckinModal, CheckinsTab, OverviewTab } from "@/components/projects/ProjectWork";
import { BaselineTab, NumbersTab } from "@/components/projects/ProjectHealth";
import { MoneyTab, SettingsTab, TeamTab } from "@/components/projects/ProjectAdmin";

type Tab = "overview" | "checkins" | "baseline" | "numbers" | "money" | "team" | "settings";

const ProjectPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: d, isLoading, error } = useProject(id);
  const { data: profile } = useProfileSettings();
  const invalidate = useInvalidateProjects();
  const [checkinOpen, setCheckinOpen] = useState(false);
  usePageTitle(d?.project.name ?? "Project");

  const derived = useMemo(() => {
    if (!d) return null;
    const today = todayISO();
    const defs = baselineTemplate(d.project.type);
    const statuses = statusMap(defs, d.baseline, derivedStatuses(d.metrics, d.money, today));
    const score = baselineScore(defs, statuses);
    const cycle = d.cycles.find((c) => c.status === "active") ?? null;
    const goalValue = cycle ? currentGoalValue(cycle, d.metrics, d.checkins) : null;
    const attention = user ? projectAttention({
      project: d.project, role: d.me.role, mode: d.me.mode, userId: user.id, cycle, checkins: d.checkins,
      baselineRows: d.baseline, baselinePct: d.project.stage === "idea" || d.project.stage === "building" ? null : score.pct,
      metrics: d.metrics, goalValue,
    }, today) : [];
    return { defs, statuses, score, cycle, goalValue, attention };
  }, [d, user]);

  if (isLoading) return <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6"><CardGridSkeleton count={3} className="grid gap-4" /></div>;
  if (error || !d || !derived) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
        <p className="text-sm text-muted-foreground">{error ? `Couldn't load the project: ${(error as Error).message}` : "This project doesn't exist, or you're not on its team."}</p>
        <Link to="/projects" className="mt-3 inline-block text-sm font-medium text-primary">← All projects</Link>
      </div>
    );
  }

  const { project: p, me } = d;
  const ownerOrMoney = me.role === "owner" || p.money_shared;
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "checkins", label: "Check-ins" },
    ...(p.stage === "idea" ? [] : [{ key: "baseline" as Tab, label: p.type === "client" ? "Wrap-up" : "Baseline" }]),
    { key: "numbers", label: "Numbers" },
    ...(ownerOrMoney ? [{ key: "money" as Tab, label: "Money" }] : []),
    { key: "team", label: "Team" },
    { key: "settings", label: "Settings" },
  ];
  const tab = (tabs.some((t) => t.key === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const backgroundBlocked = p.stage === "idea" || p.stage === "building"
    ? "Nothing to run yet: ideas and projects in Building can be in Focus or Parked."
    : !derived.score.readyForBackground
      ? `Finish the baseline first (${Math.round(derived.score.pct * 100)}% now; Background needs 80% with every Measured item done).`
      : null;

  const setMode = async (mode: Mode) => {
    if (mode === me.mode) return;
    if (mode === "background" && backgroundBlocked) return toast.error(backgroundBlocked);
    const { error } = await supabase.rpc("set_project_mode", { p_project: p.id, p_mode: mode });
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(mode === "focus" ? `${p.name} is in Focus` : mode === "background" ? `${p.name} runs in Background now` : `${p.name} is parked`);
  };

  const onDecided = async (dec: Decision) => {
    if (dec === "background") await setMode("background");
    else if (dec === "park") await setMode("parked");
    else if (dec === "kill") {
      await supabase.from("projects").update({ killed_at: new Date().toISOString(), killed_reason: "Stopped at a cycle review" }).eq("id", p.id);
      await supabase.rpc("set_project_mode", { p_project: p.id, p_mode: "parked" });
      invalidate();
      toast.success(`${p.name} stopped. Its history and lessons stay here.`);
    } else toast.success("Review saved. Set the next cycle's goal.");
  };

  const mine = d.checkins.filter((c) => c.user_id === user?.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 sm:px-6 sm:pt-8 md:pb-10">
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Projects
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{p.name}</h1>
          {p.one_liner && <p className="mt-1 text-sm text-muted-foreground">{p.one_liner}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StagePill stage={p.stage} />
            <ModePill mode={me.mode} />
            <RolePill role={me.role} />
            {p.killed_at && <span className="text-xs font-medium text-destructive">Stopped</span>}
            {p.url && (
              <a href={/^https?:\/\//.test(p.url) ? p.url : `https://${p.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {p.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        {!p.killed_at && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1 rounded-xl bg-secondary/40 p-1" role="group" aria-label="Your mode for this project">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  aria-pressed={me.mode === m.key}
                  title={m.key === "background" && backgroundBlocked ? backgroundBlocked : m.blurb}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    me.mode === m.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    m.key === "background" && backgroundBlocked && me.mode !== "background" && "opacity-50",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Your mode only. Focus: up to {profile?.focus_cap ?? 2} projects.</p>
          </div>
        )}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab d={d} attention={derived.attention} readyForBackground={derived.score.readyForBackground} onDecided={onDecided} onOpenCheckin={() => setCheckinOpen(true)} />}
      {tab === "checkins" && <CheckinsTab d={d} onOpenCheckin={() => setCheckinOpen(true)} />}
      {tab === "baseline" && <BaselineTab d={d} defs={derived.defs} statuses={derived.statuses} score={derived.score} />}
      {tab === "numbers" && <NumbersTab d={d} />}
      {tab === "money" && <MoneyTab d={d} />}
      {tab === "team" && <TeamTab d={d} />}
      {tab === "settings" && <SettingsTab d={d} />}

      {canCheckIn(me.role) && (
        <CheckinModal
          open={checkinOpen}
          onClose={() => setCheckinOpen(false)}
          projectId={p.id}
          projectName={p.name}
          cycle={derived.cycle}
          goalValue={derived.goalValue}
          mine={mine}
        />
      )}
    </div>
  );
};

export default ProjectPage;
