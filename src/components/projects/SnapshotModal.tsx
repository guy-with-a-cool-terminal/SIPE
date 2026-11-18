import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import {
  AUTO_METRICS, latestValue, metricKey, metricLabel, STANDARD_METRICS, todayISO,
  type Cycle, type MetricRow, type Project,
} from "@/lib/projects";
import { dbMessage, fmtNum } from "./bits";
import { useInvalidateProjects } from "@/hooks/useProjects";

/** Type in numbers SIPE can't fetch. Last values are shown; blanks are skipped. */
export const SnapshotModal = ({ open, onClose, project, cycle, metrics }: {
  open: boolean;
  onClose: () => void;
  project: Project;
  cycle: Cycle | null;
  metrics: MetricRow[];
}) => {
  const { user } = useAuth();
  const invalidate = useInvalidateProjects();
  const keys = useMemo(() => {
    const k = new Set<string>();
    if (cycle) k.add(cycle.metric);
    if (project.north_star_metric) k.add(project.north_star_metric);
    for (const m of metrics) if (!AUTO_METRICS.has(m.metric)) k.add(m.metric);
    for (const m of STANDARD_METRICS) k.add(m.key);
    return [...k];
  }, [cycle, project, metrics]);

  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setValues({});
    setCustomName(""); setCustomValue("");
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rows = Object.entries(values)
      .filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v)))
      .map(([metric, v]) => ({ metric, value: Number(v) }));
    if (customName.trim() && customValue.trim() !== "") rows.push({ metric: metricKey(customName), value: Number(customValue) });
    if (rows.length === 0) return toast.error("Fill in at least one number");
    setSaving(true);
    const { error } = await supabase.from("project_metrics").upsert(
      rows.map((r) => ({ project_id: project.id, metric: r.metric, on_date: date, value: r.value, source: "snapshot", created_by: user?.id, updated_at: new Date().toISOString() })),
      { onConflict: "project_id,metric,on_date" },
    );
    setSaving(false);
    if (error) return toast.error(dbMessage(error));
    invalidate();
    toast.success(`${rows.length} number${rows.length > 1 ? "s" : ""} saved`);
    onClose();
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} title="Add numbers" description="For anything SIPE can't fetch on its own. Leave the rest blank.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-muted-foreground">As of</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        {keys.map((k) => {
          const last = latestValue(metrics, k);
          return (
            <label key={k} className="grid grid-cols-[1fr_8rem] items-center gap-3">
              <span className="text-sm">
                {metricLabel(k)}
                {last !== null && <span className="block text-xs text-muted-foreground">Last: {fmtNum(last)}</span>}
              </span>
              <input type="number" step="any" value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm" />
            </label>
          );
        })}
        <div className="grid grid-cols-[1fr_8rem] gap-3 border-t border-border pt-3">
          <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Another number…" className="rounded-xl border border-border bg-input px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm" />
          <input type="number" step="any" value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="rounded-xl border border-border bg-input px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-sm" />
        </div>
        <button type="submit" disabled={saving} className={submitButton}>{saving ? "Saving…" : "Save numbers"}</button>
      </form>
    </ResponsiveModal>
  );
};
