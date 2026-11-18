import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field, submitButton } from "@/lib/forms";
import {
  metricKey, metricLabel, STAGES, STANDARD_METRICS, TYPES,
  type Project, type ProjectKind, type ProjectType, type Stage,
} from "@/lib/projects";
import { dbMessage } from "./bits";
import { useInvalidateProjects } from "@/hooks/useProjects";

interface Props {
  open: boolean;
  onClose: () => void;
  /** edit this project; omit to create */
  project?: Project;
  myShare?: number | null;
}

const CUSTOM = "__custom";

export const ProjectModal = ({ open, onClose, project, myShare }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateProjects();
  const editing = !!project;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("venture");
  const [type, setType] = useState<ProjectType>("webapp");
  const [stage, setStage] = useState<Stage>("idea");
  const [oneLiner, setOneLiner] = useState("");
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [nsMetric, setNsMetric] = useState("");
  const [nsCustom, setNsCustom] = useState("");
  const [nsTarget, setNsTarget] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [share, setShare] = useState("100");
  const [clients, setClients] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = project;
    setName(p?.name ?? "");
    setKind(p?.kind ?? "venture");
    setType(p?.type ?? "webapp");
    setStage(p?.stage ?? "idea");
    setOneLiner(p?.one_liner ?? "");
    setUrl(p?.url ?? "");
    setClientId(p?.client_id ?? "");
    setNorthStar(p?.north_star ?? "");
    const known = !p?.north_star_metric || STANDARD_METRICS.some((m) => m.key === p.north_star_metric) || p.north_star_metric === "revenue";
    setNsMetric(p?.north_star_metric ? (known ? p.north_star_metric : CUSTOM) : "");
    setNsCustom(p?.north_star_metric && !known ? metricLabel(p.north_star_metric) : "");
    setNsTarget(p?.north_star_target != null ? String(p.north_star_target) : "");
    setLaunchDate(p?.launch_date ?? "");
    setShare(myShare != null ? String(myShare) : "100");
    setMore(!!p);
    supabase.from("clients").select("id,name,company").eq("archived", false).order("name").then(({ data }) => setClients(data ?? []));
  }, [open, project, myShare]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) return toast.error("Give the project a name");
    const metric = nsMetric === CUSTOM ? (nsCustom.trim() ? metricKey(nsCustom) : null) : nsMetric || null;
    const payload = {
      name: name.trim(),
      kind,
      type: kind === "client" ? "client" : type === "client" ? "webapp" : type,
      stage,
      one_liner: oneLiner.trim() || null,
      url: url.trim() || null,
      client_id: kind === "client" && clientId ? clientId : null,
      north_star: northStar.trim() || null,
      north_star_metric: metric,
      north_star_target: nsTarget ? Number(nsTarget) : null,
      launch_date: launchDate || null,
    };
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("projects").update(payload).eq("id", project!.id);
      setSaving(false);
      if (error) return toast.error(dbMessage(error));
      invalidate();
      toast.success("Project saved");
      onClose();
      return;
    }
    const { data, error } = await supabase.from("projects").insert({ ...payload, owner_id: user.id }).select("id").single();
    if (error) { setSaving(false); return toast.error(dbMessage(error)); }
    const sharePct = Number(share);
    if (kind === "venture" && Number.isFinite(sharePct) && sharePct !== 100) {
      await supabase.from("project_members").update({ share_pct: sharePct }).eq("project_id", data.id).eq("user_id", user.id);
    }
    setSaving(false);
    invalidate();
    toast.success(`${payload.name} added`);
    onClose();
    navigate(`/projects/${data.id}`);
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit project" : "New project"}
      description={editing ? undefined : "Just the basics. Goals and the checklist come when the project needs them."}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted-foreground">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus={!editing} className={field} placeholder="e.g. Salonly" />
        </label>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/40 p-1" role="group" aria-label="Kind">
          {(["venture", "client"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {k === "venture" ? "My own product" : "Client project"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "venture" ? (
            <label className="block">
              <span className="text-sm text-muted-foreground">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as ProjectType)} className={field}>
                {TYPES.filter((t) => t.key !== "client").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="text-sm text-muted-foreground">Client</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
                <option value="">Not linked</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm text-muted-foreground">Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={field}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{STAGES.find((s) => s.key === stage)?.blurb}</p>

        {!editing && kind === "venture" && (
          <label className="block">
            <span className="text-sm text-muted-foreground">Your share (%)</span>
            <input type="number" min={0} max={100} step="0.01" value={share} onChange={(e) => setShare(e.target.value)} className={field} />
            <span className="mt-1 block text-xs text-muted-foreground">100 if it's yours alone. Co-founders' shares are set when you invite them.</span>
          </label>
        )}

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="text-sm font-medium text-primary">
            + Web address, one-liner and North Star
          </button>
        ) : (
          <>
            <label className="block">
              <span className="text-sm text-muted-foreground">Web address</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="salonly.co.ke" inputMode="url" />
              <span className="mt-1 block text-xs text-muted-foreground">Once it's launched, SIPE checks the site every day: domain, uptime, SEO and AEO basics.</span>
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">One line: what it is, who it's for</span>
              <input value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} maxLength={160} className={field} placeholder="Booking and invoicing for hair salons" />
            </label>
            {stage === "building" && (
              <label className="block">
                <span className="text-sm text-muted-foreground">Launch date</span>
                <input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} className={field} />
              </label>
            )}
            {kind === "venture" && (
              <fieldset className="rounded-2xl border border-border p-4">
                <legend className="px-1 text-sm font-medium">North Star</legend>
                <p className="mb-3 text-xs text-muted-foreground">What 100% looks like in 6 to 12 months.</p>
                <textarea value={northStar} onChange={(e) => setNorthStar(e.target.value)} rows={2} maxLength={400} className={field} placeholder="150 salons paying KES 1,500 a month, me on it 10 hours a week" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm text-muted-foreground">Measured by</span>
                    <select value={nsMetric} onChange={(e) => setNsMetric(e.target.value)} className={field}>
                      <option value="">Choose a number</option>
                      {STANDARD_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      <option value={CUSTOM}>Something else…</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-muted-foreground">Target</span>
                    <input type="number" step="any" value={nsTarget} onChange={(e) => setNsTarget(e.target.value)} className={field} placeholder="150" />
                  </label>
                </div>
                {nsMetric === CUSTOM && (
                  <input value={nsCustom} onChange={(e) => setNsCustom(e.target.value)} className={field} placeholder="e.g. Paying salons" />
                )}
              </fieldset>
            )}
          </>
        )}

        <button type="submit" disabled={saving} className={submitButton}>
          {saving ? "Saving…" : editing ? "Save" : "Add project"}
        </button>
      </form>
    </ResponsiveModal>
  );
};
