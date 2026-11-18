import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { useProfileSettings } from "@/hooks/useProjects";
import { MODULES, moduleEnabled, type ModuleKey } from "@/lib/projects";

/** Settings › Features: turn parts of SIPE on and off. The sidebar shows only what's on. */
export const FeaturesSettings = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfileSettings();
  const enabled = profile?.enabled_modules ?? null;

  const save = async (patch: Record<string, unknown>, msg: string) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile-settings"] });
    toast.success(msg);
  };

  const toggle = (key: ModuleKey, on: boolean) => {
    const current = MODULES.filter((m) => moduleEnabled(enabled, m.key)).map((m) => m.key);
    const next = on ? [...new Set([...current, key])] : current.filter((k) => k !== key);
    if (next.length === 0) return toast.error("Keep at least one part of SIPE on");
    const label = MODULES.find((m) => m.key === key)!.label;
    // Everything on is stored as null, the same as someone who signed up directly.
    save({ enabled_modules: next.length === MODULES.length ? null : next }, on ? `${label} is on. It's in your sidebar now.` : `${label} is off`);
  };

  return (
    <>
      <section className="glass rounded-2xl p-6">
        <h2 className="text-base font-semibold">Features</h2>
        <p className="mt-1 text-sm text-muted-foreground">Turn on only what you use. Your sidebar shows what's on, and nothing you've recorded is lost when you switch something off.</p>
        <ul className="mt-4 divide-y divide-border">
          {MODULES.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-sm text-muted-foreground">{m.blurb}</p>
              </div>
              <Switch checked={moduleEnabled(enabled, m.key)} onCheckedChange={(v) => toggle(m.key, v)} aria-label={m.label} />
            </li>
          ))}
        </ul>
      </section>

      {moduleEnabled(enabled, "projects") && (
        <section className="glass rounded-2xl p-6">
          <h2 className="text-base font-semibold">Focus limit</h2>
          <p className="mt-1 text-sm text-muted-foreground">How many projects can be in Focus at once. Fewer means each one gets more of you.</p>
          <div className="mt-4 grid max-w-xs grid-cols-3 gap-1 rounded-xl bg-secondary/40 p-1">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => n !== profile?.focus_cap && save({ focus_cap: n }, `Focus limit set to ${n}`)}
                aria-pressed={profile?.focus_cap === n}
                className={`rounded-lg py-2 text-sm font-medium transition ${profile?.focus_cap === n ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Lowering it doesn't move anything out of Focus. It stops you adding more until you're under the limit.</p>
        </section>
      )}
    </>
  );
};
