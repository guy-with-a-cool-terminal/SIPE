import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  addDays, carryOverPlan, growBuildCounts, metricLabel, todayISO, weekStart,
  type Checkin, type CheckinItem, type Cycle,
} from "@/lib/projects";
import { dbMessage, fmtDate } from "./bits";
import { useInvalidateProjects } from "@/hooks/useProjects";

const blank = (): CheckinItem => ({ text: "", tag: "build", done: true });

/** The weekly check-in: about 3 minutes. Upserts one row per person per week. */
export const CheckinModal = ({ open, onClose, projectId, projectName, cycle, goalValue, mine }: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  cycle: Cycle | null;
  goalValue: number | null;
  /** my check-ins on this project, newest first */
  mine: Checkin[];
}) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const thisWeek = weekStart(todayISO());
  const lastWeek = addDays(thisWeek, -7);
  const [week, setWeek] = useState(thisWeek);
  const [items, setItems] = useState<CheckinItem[]>([blank()]);
  const [blockers, setBlockers] = useState("");
  const [actions, setActions] = useState("");
  const [value, setValue] = useState("");
  const [hours, setHours] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [nextPlan, setNextPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ grow: number; build: number } | null>(null);

  const canDoLast = !mine.some((c) => c.week_start === lastWeek) && !mine.some((c) => c.week_start === thisWeek);

  useEffect(() => {
    if (!open) return;
    setSaved(null);
    const w = canDoLast && new Date().getDay() === 1 ? lastWeek : thisWeek;
    setWeek(w);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const existing = mine.find((c) => c.week_start === week);
    const prev = mine.find((c) => c.week_start < week);
    if (existing) {
      setItems(existing.items.length ? existing.items : [blank()]);
      setBlockers(existing.blockers ?? "");
      setActions(existing.actions ?? "");
      setValue(existing.metric_value != null ? String(existing.metric_value) : "");
      setHours(existing.hours != null ? String(existing.hours) : "");
      setConfidence(existing.confidence);
      setNextPlan(existing.next_plan ?? "");
    } else {
      const carried = carryOverPlan(prev);
      setItems(carried.length ? carried : [blank()]);
      setBlockers(""); setActions("");
      setValue(goalValue != null ? String(goalValue) : "");
      setHours(""); setConfidence(null); setNextPlan("");
    }
  }, [open, week, mine, goalValue]);

  const update = (i: number, patch: Partial<CheckinItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const clean = items.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text);
    setSaving(true);
    const { error } = await supabase.from("project_checkins").upsert({
      project_id: projectId,
      user_id: user.id,
      week_start: week,
      items: clean,
      blockers: blockers.trim() || null,
      actions: actions.trim() || null,
      metric_value: value !== "" ? Number(value) : null,
      hours: hours !== "" ? Number(hours) : null,
      confidence,
      next_plan: nextPlan.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,user_id,week_start" });
    setSaving(false);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    setSaved(growBuildCounts(clean));
  };

  if (saved) {
    return (
      <ResponsiveModal open={open} onClose={onClose} title={`${projectName}: week saved`}>
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-6" /></div>
          <p className="text-lg font-semibold">Week of {fmtDate(week)} saved</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved.grow + saved.build === 0
              ? "No work items this week. That's useful to know too."
              : `${saved.grow} grow, ${saved.build} build.`}{" "}
            {saved.grow === 0 && saved.build > 0 && "What's one thing next week that reaches a customer?"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Your team sees it on the project page.</p>
        </div>
        <button onClick={onClose} className={submitButton}>Done</button>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal open={open} onClose={onClose} size="lg" title={`${projectName} check-in`} description="About 3 minutes. Tag each item: build (making the product) or grow (reaching customers).">
      <form onSubmit={submit} className="space-y-5">
        {canDoLast && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/40 p-1">
            {[thisWeek, lastWeek].map((w) => (
              <button type="button" key={w} onClick={() => setWeek(w)} aria-pressed={week === w}
                className={`rounded-lg py-2 text-sm font-medium transition ${week === w ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {w === thisWeek ? "This week" : "Last week"}
              </button>
            ))}
          </div>
        )}

        <div>
          <p className="text-sm text-muted-foreground">What you did (ticked) and planned (unticked)</p>
          <ul className="mt-2 space-y-2">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => update(i, { done: !it.done })} aria-label={it.done ? "Mark not done" : "Mark done"}
                  className={cn("grid size-6 flex-shrink-0 place-items-center rounded-md border transition", it.done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {it.done && <Check className="size-4" />}
                </button>
                <input value={it.text} onChange={(e) => update(i, { text: e.target.value })} maxLength={200}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm"
                  placeholder={i === 0 ? "Visited 5 salons, 3 signed up" : ""} />
                <div className="flex flex-shrink-0 rounded-lg bg-secondary/40 p-0.5 text-xs font-medium">
                  {(["build", "grow"] as const).map((t) => (
                    <button type="button" key={t} onClick={() => update(i, { tag: t })} aria-pressed={it.tag === t}
                      className={cn("rounded-md px-2 py-1 transition", it.tag === t ? (t === "grow" ? "bg-primary text-primary-foreground" : "bg-background shadow-sm") : "text-muted-foreground")}>
                      {t}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setItems((xs) => xs.length > 1 ? xs.filter((_, j) => j !== i) : [blank()])} aria-label="Remove" className="p-1 text-muted-foreground hover:text-foreground">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {items.length < 12 && (
            <button type="button" onClick={() => setItems((xs) => [...xs, blank()])} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
              <Plus className="size-4" /> Add item
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-muted-foreground">What got in the way</span>
            <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} rows={2} className={field} placeholder="Salons want M-Pesa reminders" />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">What you did about it</span>
            <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={2} className={field} placeholder="Added to the roadmap, told them 2 weeks" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cycle && (
            <label className="block">
              <span className="text-sm text-muted-foreground">{metricLabel(cycle.metric)}</span>
              <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
            </label>
          )}
          <label className="block">
            <span className="text-sm text-muted-foreground">Hours (optional)</span>
            <input type="number" min={0} max={168} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className={field} />
          </label>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label="Confidence, 1 to 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={confidence === n} onClick={() => setConfidence(confidence === n ? null : n)}
                  className={cn("h-10 flex-1 rounded-lg border text-sm font-semibold transition", confidence !== null && n <= confidence ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-sm text-muted-foreground">Next week's plan</span>
          <textarea value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} rows={2} className={field} placeholder="Post 2 reels · call 3 supply shops · ship reminders" />
          <span className="mt-1 block text-xs text-muted-foreground">Separate items with a new line or ·. They come back as next week's list.</span>
        </label>

        <button type="submit" disabled={saving} className={submitButton}>{saving ? "Saving…" : "Save check-in"}</button>
      </form>
    </ResponsiveModal>
  );
};
