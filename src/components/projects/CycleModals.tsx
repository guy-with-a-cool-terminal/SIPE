import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import {
  addDays, AUTO_METRICS, latestValue, metricKey, metricLabel, STANDARD_METRICS, todayISO, verdictFor,
  type Cycle, type Decision, type MetricRow, type Project, type StopAction,
} from "@/lib/projects";
import { dbMessage, fmtNum } from "./bits";
import { useInvalidateProjects } from "@/hooks/useProjects";

const CUSTOM = "__custom";
const LENGTHS = [60, 90, 120];
const STOP_ACTIONS: { key: StopAction; label: string }[] = [
  { key: "change", label: "change the approach" },
  { key: "background", label: "move it to Background" },
  { key: "park", label: "park it" },
  { key: "kill", label: "stop it for good" },
];

export const CycleModal = ({ open, onClose, project, cycles, metrics, onSaved }: {
  open: boolean;
  onClose: () => void;
  project: Project;
  cycles: Cycle[];
  metrics: MetricRow[];
  onSaved?: () => void;
}) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const last = cycles[0];
  const known = useMemo(() => {
    const keys = new Set<string>(STANDARD_METRICS.map((m) => m.key));
    if (project.north_star_metric) keys.add(project.north_star_metric);
    for (const m of metrics) if (!AUTO_METRICS.has(m.metric)) keys.add(m.metric);
    if (last) keys.add(last.metric);
    return [...keys];
  }, [project, metrics, last]);

  const [metric, setMetric] = useState("");
  const [custom, setCustom] = useState("");
  const [target, setTarget] = useState("");
  const [startValue, setStartValue] = useState("0");
  const [length, setLength] = useState(90);
  const [plan, setPlan] = useState("");
  const [stopBelow, setStopBelow] = useState("");
  const [stopAction, setStopAction] = useState<StopAction>("change");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  const chosen = metric === CUSTOM ? (custom.trim() ? metricKey(custom) : "") : metric;

  useEffect(() => {
    if (!open) return;
    const m = last?.metric ?? project.north_star_metric ?? "";
    setMetric(m);
    setCustom("");
    setTarget("");
    setPlan(last?.decision === "continue" ? last.plan ?? "" : "");
    setStopBelow("");
    setStopAction("change");
    setHours(last?.hours_per_week != null ? String(last.hours_per_week) : "");
    setLength(90);
  }, [open, last, project.north_star_metric]);

  useEffect(() => {
    if (!open || !chosen) return;
    const v = latestValue(metrics, chosen) ?? (last?.metric === chosen ? last.result : null);
    setStartValue(v != null ? String(v) : "0");
  }, [open, chosen, metrics, last]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return toast.error("Pick the number this cycle is about");
    const t = Number(target);
    if (!target || !Number.isFinite(t)) return toast.error("Set a target");
    if (t === Number(startValue)) return toast.error("The target should differ from where you are now");
    setSaving(true);
    const today = todayISO();
    const { error } = await supabase.from("project_cycles").insert({
      project_id: project.id,
      n: (last?.n ?? 0) + 1,
      metric: chosen,
      target: t,
      start_value: Number(startValue) || 0,
      starts_on: today,
      ends_on: addDays(today, length),
      plan: plan.trim() || null,
      stop_below: stopBelow ? Number(stopBelow) : null,
      stop_action: stopBelow ? stopAction : null,
      hours_per_week: hours ? Number(hours) : null,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(`Cycle ${(last?.n ?? 0) + 1} started. Ends ${addDays(today, length)}`);
    onSaved?.();
    onClose();
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} size="lg" title={`Start cycle ${(last?.n ?? 0) + 1}`}
      description="One number, one date, one plan, and what you'll do if it doesn't work.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="block">
            <span className="text-sm text-muted-foreground">Goal</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className={field}>
              <option value="">Choose a number</option>
              {known.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
              <option value={CUSTOM}>Something else…</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Target</span>
            <input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className={field} required />
          </label>
        </div>
        {metric === CUSTOM && <input value={custom} onChange={(e) => setCustom(e.target.value)} className={field} placeholder="e.g. Paying salons" />}
        <label className="block">
          <span className="text-sm text-muted-foreground">Where it is today</span>
          <input type="number" step="any" value={startValue} onChange={(e) => setStartValue(e.target.value)} className={field} />
        </label>
        <div>
          <span className="text-sm text-muted-foreground">Length</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-secondary/40 p-1">
            {LENGTHS.map((l) => (
              <button type="button" key={l} onClick={() => setLength(l)} aria-pressed={length === l}
                className={`rounded-lg py-2 text-sm font-medium transition ${length === l ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {l} days
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Ends {addDays(todayISO(), length)}. 90 is long enough for a plan to show results, short enough that a bad one costs 3 months, not a year.</p>
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">Plan: how you'll get there, in one sentence</span>
          <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} maxLength={300} className={field}
            placeholder="Partner with 3 salon-supply shops to demo it to their customers" />
        </label>
        <fieldset className="rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-medium">Stop rule</legend>
          <p className="mb-3 text-xs text-muted-foreground">Set it now, before you're attached to the result.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-muted-foreground">If below this by the end…</span>
              <input type="number" step="any" value={stopBelow} onChange={(e) => setStopBelow(e.target.value)} className={field} placeholder="e.g. 25" />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">…I will</span>
              <select value={stopAction} onChange={(e) => setStopAction(e.target.value as StopAction)} className={field} disabled={!stopBelow}>
                {STOP_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
        <label className="block">
          <span className="text-sm text-muted-foreground">Hours a week you'll give it (optional)</span>
          <input type="number" min={0} max={100} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className={field} />
        </label>
        <button type="submit" disabled={saving} className={submitButton}>{saving ? "Starting…" : "Start cycle"}</button>
      </form>
    </ResponsiveModal>
  );
};

const DECISIONS: { key: Decision; label: string; blurb: string }[] = [
  { key: "continue", label: "Keep going", blurb: "Same direction, new goal." },
  { key: "change", label: "Change the approach", blurb: "New plan for the next cycle." },
  { key: "background", label: "Move to Background", blurb: "Let it run and measure itself." },
  { key: "park", label: "Park it", blurb: "Switch it off for now." },
  { key: "kill", label: "Stop it for good", blurb: "Keeps the history and the lessons." },
];

/** Day-90 review: the verdict, a decision and the one lesson worth keeping. */
export const CycleReviewModal = ({ open, onClose, cycle, current, isOwner, readyForBackground, onDecided }: {
  open: boolean;
  onClose: () => void;
  cycle: Cycle;
  current: number | null;
  isOwner: boolean;
  readyForBackground: boolean;
  onDecided: (d: Decision) => void;
}) => {
  const invalidate = useInvalidateProjects();
  const [result, setResult] = useState("");
  const [decision, setDecision] = useState<Decision>("continue");
  const [lesson, setLesson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(current != null ? String(current) : "");
    setLesson("");
    const stopHit = cycle.stop_below != null && current != null && current < cycle.stop_below;
    setDecision(stopHit && cycle.stop_action ? (cycle.stop_action as Decision) : "continue");
  }, [open, current, cycle]);

  const r = Number(result);
  const verdict = result !== "" && Number.isFinite(r) ? verdictFor(cycle, r) : null;
  const stopHit = cycle.stop_below != null && result !== "" && r < cycle.stop_below;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verdict) return toast.error("Enter where the number ended up");
    if (decision === "kill" && !isOwner) return toast.error("Only the owner can stop a project. Pick another option or ask them.");
    if (decision === "background" && !readyForBackground) return toast.error("The baseline isn't ready for Background yet (80%, with every Measured item done). Park it, or finish the baseline first.");
    setSaving(true);
    const { error } = await supabase.from("project_cycles").update({
      result: r, verdict, decision, lesson: lesson.trim() || null, status: "closed", closed_at: new Date().toISOString(),
    }).eq("id", cycle.id);
    setSaving(false);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    onDecided(decision);
    onClose();
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} size="lg" title={`Review cycle ${cycle.n}`}
      description={`Goal: ${metricLabel(cycle.metric)} from ${fmtNum(cycle.start_value)} to ${fmtNum(cycle.target)}.`}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted-foreground">Where it ended up</span>
          <input type="number" step="any" value={result} onChange={(e) => setResult(e.target.value)} className={field} required />
        </label>
        {verdict && (
          <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">
            <span className={`font-semibold ${verdict === "hit" ? "text-primary" : verdict === "partial" ? "text-warning" : "text-destructive"}`}>
              {verdict === "hit" ? "Goal hit." : verdict === "partial" ? "Partly there." : "Missed."}
            </span>{" "}
            {stopHit && cycle.stop_action
              ? `Below your stop rule (${fmtNum(cycle.stop_below)}). You said you'd ${STOP_ACTIONS.find((a) => a.key === cycle.stop_action)?.label}.`
              : verdict === "hit" ? "Raise the bar for the next cycle, or let it run in Background." : "Worth asking what the plan got wrong."}
          </p>
        )}
        <div className="grid gap-2">
          {DECISIONS.map((d) => (
            <label key={d.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${decision === d.key ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="decision" checked={decision === d.key} onChange={() => setDecision(d.key)} className="mt-1 accent-[hsl(var(--primary))]" />
              <span>
                <span className="block text-sm font-medium">{d.label}</span>
                <span className="block text-xs text-muted-foreground">{d.blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">The one lesson worth keeping</span>
          <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} rows={2} maxLength={400} className={field}
            placeholder="Salon owners sign up through WhatsApp groups, not Instagram" />
        </label>
        <button type="submit" disabled={saving} className={submitButton}>{saving ? "Saving…" : "Save review"}</button>
      </form>
    </ResponsiveModal>
  );
};
