import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  BUCKET_META, formatKES,
  type Goal, type GoalProgress, type GoalStatus,
} from "@/integrations/supabase/types";
import { pct, projectCompletion, onTrack } from "@/lib/goals";
import { goalIcon } from "@/lib/goalIcons";
import { Archive, ArchiveRestore, Check, Pause, Pencil, Play, Plus, Target, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoalModal } from "@/components/app/GoalModal";
import { GoalContributionModal } from "@/components/app/GoalContributionModal";

type Filter = "active" | "paused" | "achieved" | "all";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface Contribution { goal_id: string; amount: number; occurred_at: string }

const fmtMonth = (d: Date) => d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

const Goals = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({});
  const [contribs, setContribs] = useState<Contribution[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("active");
  const [reloadKey, setReloadKey] = useState(0);

  const [goalModal, setGoalModal] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const [contribModal, setContribModal] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [goalsRes, progRes, contribRes, acctRes] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("goal_progress").select("*").eq("user_id", user.id),
        supabase.from("goal_contributions").select("goal_id,amount,occurred_at").eq("user_id", user.id).order("occurred_at", { ascending: true }),
        supabase.from("accounts").select("id,name").eq("user_id", user.id),
      ]);
      if (goalsRes.error) toast.error(goalsRes.error.message);
      setGoals(goalsRes.data || []);

      const pmap: Record<string, GoalProgress> = {};
      (progRes.data || []).forEach((p: GoalProgress) => { pmap[p.goal_id] = p; });
      setProgress(pmap);

      setContribs((contribRes.data || []) as Contribution[]);

      const amap: Record<string, string> = {};
      (acctRes.data || []).forEach((a: { id: string; name: string }) => { amap[a.id] = a.name; });
      setAccountNames(amap);

      setLoading(false);
    })();
  }, [user, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // If the current filter's tab is hidden (its category emptied out), fall back.
  useEffect(() => {
    if ((filter === "paused" || filter === "achieved") &&
        goals.length > 0 && goals.filter((g) => g.status === filter).length === 0) {
      setFilter("active");
    }
  }, [goals, filter]);

  const contribsByGoal = useMemo(() => {
    const m: Record<string, Contribution[]> = {};
    for (const c of contribs) (m[c.goal_id] ??= []).push(c);
    return m;
  }, [contribs]);

  const currentOf = (g: Goal) => Number(progress[g.id]?.current_amount ?? 0);

  const visible = useMemo(() => {
    const list = filter === "all"
      ? [...goals].sort((a, b) => rank(a.status) - rank(b.status))
      : goals.filter((g) => g.status === filter);
    return list;
  }, [goals, filter]);

  const counts = useMemo(() => ({
    active: goals.filter((g) => g.status === "active").length,
    paused: goals.filter((g) => g.status === "paused").length,
    achieved: goals.filter((g) => g.status === "achieved").length,
    all: goals.length,
  }), [goals]);

  // Aggregate across everything still being worked toward (active + paused).
  const totals = useMemo(() => {
    const inScope = goals.filter((g) => g.status === "active" || g.status === "paused");
    let target = 0, saved = 0;
    for (const g of inScope) {
      const t = Number(g.target_amount);
      target += t;
      saved += Math.min(Number(progress[g.id]?.current_amount ?? 0), t);
    }
    return { count: inScope.length, target, saved, remaining: Math.max(0, target - saved) };
  }, [goals, progress]);

  const setStatus = async (g: Goal, status: GoalStatus) => {
    const patch: Partial<Goal> = { status };
    patch.achieved_at = status === "achieved" ? new Date().toISOString() : null;
    const { error } = await supabase.from("goals").update(patch).eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success(
      status === "achieved" ? "Goal achieved"
        : status === "paused" ? "Goal paused. Find it under the Paused filter"
        : status === "archived" ? "Goal archived"
        : "Goal resumed",
    );
    reload();
  };

  const remove = async () => {
    if (!deleteGoal) return;
    const { error } = await supabase.from("goals").delete().eq("id", deleteGoal.id);
    setDeleteGoal(null);
    if (error) return toast.error(error.message);
    toast.success("Goal deleted");
    reload();
  };

  const projectionLine = (g: Goal, current: number): { text: string; tone: "ok" | "warn" | "muted" } => {
    const target = Number(g.target_amount);
    if (current >= target) return { text: "Target reached", tone: "ok" };
    const proj = projectCompletion(contribsByGoal[g.id] ?? [], target, current, new Date());
    if (!proj) {
      if (g.funding === "bucket" && g.bucket) return { text: `Tracks your ${BUCKET_META[g.bucket].name} bucket`, tone: "muted" };
      if (g.funding === "account") return { text: `Tracks ${g.account_id ? accountNames[g.account_id] ?? "an account" : "an account"}`, tone: "muted" };
      return { text: "Add contributions to see a projection", tone: "muted" };
    }
    const track = onTrack(proj.projectedDate, g.target_date);
    const month = fmtMonth(proj.projectedDate);
    if (track === "behind" && g.target_date) {
      const weeks = Math.max(1, Math.round((proj.projectedDate.getTime() - new Date(g.target_date).getTime()) / WEEK_MS));
      return { text: `Behind by ~${weeks} week${weeks !== 1 ? "s" : ""} · ~${month}`, tone: "warn" };
    }
    if (track === "on_track") return { text: `On track, ~${month}`, tone: "ok" };
    return { text: `~${month} at this pace`, tone: "muted" };
  };

  const filterBtn = (f: Filter, label: string, n: number) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label} <span className="tabular-nums opacity-60">{n}</span>
    </button>
  );

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Goals</h1>
          <p className="text-muted-foreground mt-1">Named targets with progress and projections.</p>
        </div>
        <button
          onClick={() => setGoalModal({ open: true, goal: null })}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition text-sm"
        >
          <Plus className="size-4" /> New goal
        </button>
      </div>

      {!loading && totals.count > 0 && (
        <div className="glass rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Across {totals.count} goal{totals.count !== 1 ? "s" : ""} in progress
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {totals.target > 0 ? Math.round((totals.saved / totals.target) * 100) : 0}% funded
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-lg md:text-xl font-bold tabular-nums">{formatKES(totals.target)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total target</p>
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold tabular-nums text-primary">{formatKES(totals.saved)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Saved so far</p>
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold tabular-nums">{formatKES(totals.remaining)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Still to save</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden mt-4">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${totals.target > 0 ? Math.min(100, (totals.saved / totals.target) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {!loading && goals.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6">
          {filterBtn("active", "Active", counts.active)}
          {counts.paused > 0 && filterBtn("paused", "Paused", counts.paused)}
          {counts.achieved > 0 && filterBtn("achieved", "Achieved", counts.achieved)}
          {filterBtn("all", "All", counts.all)}
        </div>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : goals.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
            <Target className="size-6" />
          </div>
          <p className="font-medium">No goals yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Set a target like an emergency fund, a laptop or a trip, and fund it from a bucket, an account,
            a slice of every deposit, or manual contributions.
          </p>
          <button
            onClick={() => setGoalModal({ open: true, goal: null })}
            className="mt-4 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition text-sm"
          >
            <Plus className="size-4" /> New goal
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No {filter} goals.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((g) => {
            const current = currentOf(g);
            const target = Number(g.target_amount);
            const p = pct(current, target);
            const achieved = g.status === "achieved";
            const done = current >= target;
            const accent = g.color || (g.bucket ? `hsl(${BUCKET_META[g.bucket].color})` : "hsl(var(--primary))");
            const proj = projectionLine(g, current);
            const canContribute = (g.funding === "manual" || g.funding === "deposit_pct") && g.status === "active";
            const Icon = goalIcon(g.icon);

            return (
              <div
                key={g.id}
                className={`glass rounded-2xl p-5 flex flex-col ${achieved ? "border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : ""} ${g.status === "archived" || g.status === "paused" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-11 rounded-xl grid place-items-center flex-shrink-0" style={{ backgroundColor: `${accent}22`, color: accent }}>
                      <Icon className="size-[22px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.funding === "bucket" && g.bucket ? `${BUCKET_META[g.bucket].name} bucket`
                          : g.funding === "account" ? (g.account_id ? accountNames[g.account_id] ?? "Account" : "Account")
                          : g.funding === "deposit_pct" ? `${Number(g.deposit_pct)}% of deposits`
                          : "Manual"}
                        {g.status === "paused" && " · paused"}
                        {g.status === "archived" && " · archived"}
                      </p>
                    </div>
                  </div>
                  {achieved && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium whitespace-nowrap">
                      <Trophy className="size-3" /> {g.achieved_at ? fmtDate(g.achieved_at) : "Achieved"}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-semibold tabular-nums">{formatKES(current)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">of {formatKES(target)} · {Math.round(p)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${p}%`, backgroundColor: done ? "hsl(var(--primary))" : accent }}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs flex-1">
                  {g.target_date && (
                    <p className="text-muted-foreground">Target date {fmtDate(g.target_date)}</p>
                  )}
                  <p className={proj.tone === "ok" ? "text-primary font-medium" : proj.tone === "warn" ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {proj.text}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 mt-4 pt-3 border-t border-border/60">
                  {canContribute && (
                    <button onClick={() => setContribModal({ open: true, goal: g })} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition" title="Add contribution">
                      <Plus className="size-[18px]" />
                    </button>
                  )}
                  <button onClick={() => setGoalModal({ open: true, goal: g })} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition" title="Edit">
                    <Pencil className="size-[18px]" />
                  </button>
                  {g.status !== "achieved" && (
                    <button onClick={() => setStatus(g, "achieved")} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition" title="Mark achieved">
                      <Check className="size-[18px]" />
                    </button>
                  )}
                  {g.status === "active" && (
                    <button onClick={() => setStatus(g, "paused")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition" title="Pause">
                      <Pause className="size-[18px]" />
                    </button>
                  )}
                  {(g.status === "paused" || g.status === "achieved" || g.status === "archived") && (
                    <button onClick={() => setStatus(g, "active")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition" title="Resume">
                      <Play className="size-[18px]" />
                    </button>
                  )}
                  {g.status !== "archived" ? (
                    <button onClick={() => setStatus(g, "archived")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition ml-auto" title="Archive">
                      <Archive className="size-[18px]" />
                    </button>
                  ) : (
                    <button onClick={() => setStatus(g, "active")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition ml-auto" title="Restore">
                      <ArchiveRestore className="size-[18px]" />
                    </button>
                  )}
                  <button onClick={() => setDeleteGoal(g)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition" title="Delete">
                    <Trash2 className="size-[18px]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <GoalModal
        open={goalModal.open}
        goal={goalModal.goal}
        goals={goals}
        userId={user?.id ?? ""}
        onClose={() => setGoalModal({ open: false, goal: null })}
        onSaved={reload}
      />
      <GoalContributionModal
        open={contribModal.open}
        goal={contribModal.goal}
        current={contribModal.goal ? currentOf(contribModal.goal) : undefined}
        userId={user?.id ?? ""}
        onClose={() => setContribModal({ open: false, goal: null })}
        onSaved={reload}
      />

      <AlertDialog open={!!deleteGoal} onOpenChange={(open) => { if (!open) setDeleteGoal(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteGoal?.name}” and its contribution history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function rank(s: GoalStatus): number {
  return s === "active" ? 0 : s === "paused" ? 1 : s === "achieved" ? 2 : 3;
}

export default Goals;
