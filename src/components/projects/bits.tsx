import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { modeLabel, PACE_LABEL, roleLabel, stageLabel, type Mode, type Pace, type Role, type Stage } from "@/lib/projects";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** POST to an edge function as the signed-in user. Throws the function's error message. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

/** Postgres raise messages carry a code prefix ("focus_cap: ..."); people only need the sentence. */
export const dbMessage = (e: { message?: string } | null | undefined) =>
  (e?.message ?? "Something went wrong").replace(/^[a-z_]+:\s*/, "");

const MODE_TONE: Record<Mode, string> = {
  focus: "border-primary/30 bg-primary/10 text-primary",
  background: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  parked: "border-border bg-muted text-muted-foreground",
};

export const Pill = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>
    {children}
  </span>
);

export const ModePill = ({ mode }: { mode: Mode }) => <Pill className={MODE_TONE[mode]}>{modeLabel(mode)}</Pill>;
export const StagePill = ({ stage }: { stage: Stage }) => <Pill className="border-border bg-background text-muted-foreground">{stageLabel(stage)}</Pill>;
export const RolePill = ({ role }: { role: Role }) =>
  role === "owner" ? null : <Pill className="border-border bg-background text-muted-foreground">{roleLabel(role)}</Pill>;

const PACE_TONE: Record<Pace, string> = {
  hit: "text-primary",
  on_pace: "text-primary",
  behind: "text-warning",
  far_behind: "text-destructive",
};
export const PaceText = ({ pace, className }: { pace: Pace; className?: string }) => (
  <span className={cn("font-medium", PACE_TONE[pace], className)}>{PACE_LABEL[pace]}</span>
);

export const Bar = ({ value, tone = "primary", className }: { value: number; tone?: "primary" | "warning" | "destructive"; className?: string }) => (
  <div className={cn("h-2 overflow-hidden rounded-full bg-secondary", className)}>
    <div
      className={cn("h-full rounded-full transition-all", tone === "primary" ? "bg-primary" : tone === "warning" ? "bg-warning" : "bg-destructive")}
      style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
    />
  </div>
);

export const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : Number(n).toLocaleString("en-KE", { maximumFractionDigits: 1 });

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export const Section = ({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn("glass rounded-2xl p-5", className)}>
    {(title || action) && (
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const primaryBtn = "inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50";
export const secondaryBtn = "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/40 disabled:opacity-50";
export const linkBtn = "text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50";
