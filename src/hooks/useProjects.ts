import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  addDays, baselineScore, baselineTemplate, currentGoalValue, cycleProgress, derivedStatuses, projectAttention,
  statusMap, todayISO,
  type BaselineRow, type Checkin, type Cycle, type MetricRow, type Membership, type Project, type ProjectMoney,
  type TeamMember,
} from "@/lib/projects";

export interface ProfileSettings {
  focus_cap: number;
  enabled_modules: string[] | null;
  signup_source: string | null;
  full_name: string | null;
}

/** focus cap, enabled modules (focused view) and how the user arrived */
export function useProfileSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile-settings", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("focus_cap, enabled_modules, signup_source, full_name").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return (data ?? { focus_cap: 2, enabled_modules: null, signup_source: null, full_name: null }) as ProfileSettings;
    },
  });
}

export interface ProjectRow {
  project: Project;
  me: Membership;
  cycle: Cycle | null;
  goalValue: number | null;
  score: ReturnType<typeof baselineScore> | null;
  checkins: Checkin[];
  metrics: MetricRow[];
  baselineRows: BaselineRow[];
}

/** Every project I'm on, with what the list, the Dashboard card and attention need. */
export function useMyProjects() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mem, error } = await supabase.from("project_members")
        .select("*, project:projects(*)").eq("user_id", user!.id).eq("status", "active");
      if (error) throw error;
      const memberships = (mem ?? []) as (Membership & { project: Project })[];
      const ids = memberships.map((m) => m.project_id);
      if (ids.length === 0) return { memberships, cycles: [], checkins: [], baseline: [], metrics: [] };
      const since = addDays(todayISO(), -120);
      const [cycles, checkins, baseline, metrics] = await Promise.all([
        supabase.from("project_cycles").select("*").in("project_id", ids).eq("status", "active"),
        supabase.from("project_checkins").select("id,project_id,user_id,week_start,items,metric_value,created_at,confidence,hours").in("project_id", ids).gte("week_start", addDays(todayISO(), -42)),
        supabase.from("project_baseline_items").select("*").in("project_id", ids),
        supabase.from("project_metrics").select("project_id,metric,on_date,value,source").in("project_id", ids).gte("on_date", since),
      ]);
      for (const r of [cycles, checkins, baseline, metrics]) if (r.error) throw r.error;
      return {
        memberships,
        cycles: (cycles.data ?? []) as Cycle[],
        checkins: (checkins.data ?? []) as Checkin[],
        baseline: (baseline.data ?? []) as BaselineRow[],
        metrics: (metrics.data ?? []) as MetricRow[],
      };
    },
  });

  const rows = useMemo<ProjectRow[]>(() => {
    const d = q.data;
    if (!d) return [];
    const today = todayISO();
    return d.memberships.map((m) => {
      const p = m.project;
      const cycle = d.cycles.find((c) => c.project_id === p.id) ?? null;
      const checkins = d.checkins.filter((c) => c.project_id === p.id);
      const metrics = d.metrics.filter((x) => x.project_id === p.id);
      const baselineRows = d.baseline.filter((b) => b.project_id === p.id);
      const goalValue = cycle ? currentGoalValue(cycle, metrics, checkins) : null;
      const defs = baselineTemplate(p.type);
      // Money items need project_money(); the list doesn't load it, so they count as unknown here.
      const statuses = statusMap(defs, baselineRows, derivedStatuses(metrics, null, today));
      const score = p.stage === "idea" || p.stage === "building" ? null : baselineScore(defs, statuses);
      const { project: _p, ...me } = m;
      return { project: p, me: me as Membership, cycle, goalValue, score, checkins, metrics, baselineRows };
    });
  }, [q.data]);

  const attention = useMemo(() => {
    if (!user) return [];
    const today = todayISO();
    return rows
      .flatMap((r) => projectAttention({
        project: r.project, role: r.me.role, mode: r.me.mode, userId: user.id, cycle: r.cycle,
        checkins: r.checkins, baselineRows: r.baselineRows, baselinePct: r.score?.pct ?? null,
        metrics: r.metrics, goalValue: r.goalValue,
      }, today))
      .sort((a, b) => a.rank - b.rank);
  }, [rows, user]);

  return { rows, attention, isLoading: q.isLoading, error: q.error };
}

/** Everything for one project page. */
export function useProject(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const [project, me, team, cycles, checkins, baseline, metrics, money] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id!).maybeSingle(),
        supabase.from("project_members").select("*").eq("project_id", id!).eq("user_id", user!.id).eq("status", "active").maybeSingle(),
        supabase.rpc("project_team", { p_project: id! }),
        supabase.from("project_cycles").select("*").eq("project_id", id!).order("n", { ascending: false }),
        supabase.from("project_checkins").select("*").eq("project_id", id!).gte("week_start", addDays(todayISO(), -26 * 7)).order("week_start", { ascending: false }),
        supabase.from("project_baseline_items").select("*").eq("project_id", id!),
        supabase.from("project_metrics").select("*").eq("project_id", id!).gte("on_date", addDays(todayISO(), -400)).order("on_date"),
        supabase.rpc("project_money", { p_project: id! }),
      ]);
      if (project.error) throw project.error;
      if (!project.data || !me.data) return null;
      return {
        project: project.data as Project,
        me: me.data as Membership,
        team: (team.data ?? []) as TeamMember[],
        cycles: (cycles.data ?? []) as Cycle[],
        checkins: (checkins.data ?? []) as Checkin[],
        baseline: (baseline.data ?? []) as BaselineRow[],
        metrics: (metrics.data ?? []) as MetricRow[],
        money: (money.error ? null : money.data) as ProjectMoney | null,
      };
    },
  });
}

export type ProjectData = NonNullable<ReturnType<typeof useProject>["data"]>;

export function useInvalidateProjects() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };
}

/** Today's progress for a project row: handy for cards. */
export function rowProgress(r: Pick<ProjectRow, "cycle" | "goalValue">) {
  return r.cycle ? cycleProgress(r.cycle, r.goalValue, todayISO()) : null;
}
