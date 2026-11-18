import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatKES, type Goal } from "@/integrations/supabase/types";
import { usePlannerData } from "@/hooks/usePlannerData";
import { addMonths, monthlyEquivalent, monthsAhead, nextStep, surplusSuggestion } from "@/lib/planner";
import { GetAheadPlanner } from "@/components/calculators/GetAheadPlanner";

const DISMISS_KEY = "sipe.surplusDismissed";
const fmtMonth = (d: Date) => d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

function dismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; }
}
function dismiss(id: string) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed(), id].slice(-50))); } catch { /* private mode */ }
}

type GoalLite = Pick<Goal, "id" | "name" | "target_amount" | "bill_id" | "funding" | "sort_order">;

/**
 * Dashboard block for paying bills ahead:
 *  - "Months ahead" for every active goal linked to a bill.
 *  - A one-time prompt when the latest payment came in above a typical month,
 *    suggesting half the extra goes to the next goal.
 */
export const MonthsAhead = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: planner } = usePlannerData();
  const [planOpen, setPlanOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>(dismissed);
  const [adding, setAdding] = useState(false);

  const { data } = useQuery({
    queryKey: ["dashboard", "ahead", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [goalsRes, progRes, lastRes] = await Promise.all([
        supabase.from("goals")
          .select("id,name,target_amount,bill_id,funding,sort_order")
          .eq("user_id", user!.id).eq("status", "active")
          .in("funding", ["manual", "deposit_pct"])
          .order("sort_order"),
        supabase.from("goal_progress").select("goal_id,current_amount").eq("user_id", user!.id),
        supabase.from("transactions")
          .select("id,amount,occurred_at")
          .eq("user_id", user!.id).eq("type", "income").is("parent_id", null)
          .neq("category", "Transfer").gte("occurred_at", since)
          .order("occurred_at", { ascending: false }).limit(1),
      ]);
      const progress: Record<string, number> = {};
      (progRes.data || []).forEach((p: { goal_id: string; current_amount: number }) => {
        progress[p.goal_id] = Number(p.current_amount);
      });
      const last = (lastRes.data?.[0] ?? null) as { id: string; amount: number; occurred_at: string } | null;

      // Skip the prompt if the payment already had a manual top-up recorded against it.
      let alreadyTopped = false;
      if (last) {
        const { count } = await supabase.from("goal_contributions")
          .select("id", { count: "exact", head: true })
          .eq("transaction_id", last.id).eq("auto", false);
        alreadyTopped = (count ?? 0) > 0;
      }
      return { goals: (goalsRes.data || []) as GoalLite[], progress, last, alreadyTopped };
    },
  });

  if (!data) return null;
  const { goals, progress, last, alreadyTopped } = data;
  const billById = new Map(planner.bills.map((b) => [b.id, b]));

  const ladder = goals
    .filter((g) => g.bill_id && billById.has(g.bill_id))
    .map((g) => {
      const bill = billById.get(g.bill_id!)!;
      const perMonth = monthlyEquivalent(Number(bill.amount), bill.every_months);
      const saved = progress[g.id] ?? 0;
      const ahead = monthsAhead(saved, perMonth);
      const goalMonths = Math.round(Number(g.target_amount) / perMonth);
      const next = nextStep(ahead);
      return { g, bill, perMonth, saved, ahead, goalMonths, next };
    });

  // Surplus prompt: the next unfinished goal, bill-linked ones first.
  const open = goals.filter((g) => (progress[g.id] ?? 0) < Number(g.target_amount));
  const target = open.find((g) => g.bill_id) ?? open[0];
  const suggestion = last && target && !alreadyTopped && !hidden.includes(last.id)
    ? surplusSuggestion(Number(last.amount), planner.income.monthly, Number(target.target_amount) - (progress[target.id] ?? 0))
    : null;

  const addSurplus = async () => {
    if (!last || !target || !suggestion || !user) return;
    setAdding(true);
    const { error } = await supabase.from("goal_contributions").insert({
      goal_id: target.id,
      user_id: user.id,
      amount: suggestion,
      note: "Extra from a bigger than usual payment",
      transaction_id: last.id,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`${formatKES(suggestion, { whole: true })} added to ${target.name}`);
    dismiss(last.id);
    setHidden(dismissed());
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  if (ladder.length === 0 && !suggestion) return null;

  return (
    <div className="-mt-4 mb-8 space-y-3">
      {suggestion && last && target && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-primary p-4">
          <p className="min-w-0 text-sm">
            Your {formatKES(Number(last.amount), { whole: true })} payment on {fmtDay(last.occurred_at)} was{" "}
            {formatKES(Number(last.amount) - planner.income.monthly, { whole: true })} above a typical month.
            Put <span className="font-semibold text-primary">{formatKES(suggestion, { whole: true })}</span> toward {target.name}?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { dismiss(last.id); setHidden(dismissed()); }}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Not now
            </button>
            <button
              onClick={addSurplus} disabled={adding}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add it"}
            </button>
          </div>
        </div>
      )}

      {ladder.length > 0 && (
        <div className="glass rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Months ahead on bills</p>
            <button onClick={() => setPlanOpen(true)} className="text-xs font-medium text-primary hover:text-primary/80">
              Plan another
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ladder.map(({ g, bill, perMonth, saved, ahead, goalMonths, next }) => {
              const pctToGoal = Math.min(100, (saved / Number(g.target_amount)) * 100);
              return (
                <div key={g.id} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{bill.name}</p>
                    <p className={`flex-shrink-0 text-sm font-semibold tabular-nums ${ahead >= 1 ? "text-primary" : ""}`}>
                      {ahead} of {goalMonths} months
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pctToGoal}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {ahead >= 1 ? `Covered to ${fmtMonth(addMonths(new Date(), Math.floor(ahead)))}. ` : ""}
                    {next != null && next <= goalMonths
                      ? `${formatKES(Math.max(0, next * perMonth - saved), { whole: true })} to ${next} month${next === 1 ? "" : "s"}.`
                      : ahead >= goalMonths ? "Goal reached." : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Tracked in <Link to="/goals" className="text-primary hover:text-primary/80">Goals</Link>. Your normal monthly bills still come from Expenses.
          </p>
        </div>
      )}

      <GetAheadPlanner open={planOpen} onClose={() => setPlanOpen(false)} />
    </div>
  );
};
