// Small building blocks shared by every calculator modal.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { INTEREST_WHT, netRate } from "@/lib/planner";
import type { TypicalIncome } from "@/lib/planner";

export const fieldCls =
  "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary";

/** Parse a number input's string; blank or junk is 0. */
export const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const kes = (n: number) => formatKES(Math.round(n), { whole: true });

export const fmtMonthYear = (d: Date) => d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });

/**
 * Seed form state once each time a modal opens, after its data has loaded.
 * `seed` runs when `open && ready` flips true; closing resets it.
 */
export function useSeed(open: boolean, ready: boolean, seed: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!open) { done.current = false; return; }
    if (ready && !done.current) { done.current = true; seed(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready]);
}

export const NumberField = ({
  label, value, onChange, prefix = "KES", hint, step = "1", min = 0, className,
}: {
  label: ReactNode; value: string; onChange: (v: string) => void;
  prefix?: string; hint?: ReactNode; step?: string; min?: number; className?: string;
}) => (
  <label className={cn("block min-w-0", className)}>
    <span className="text-sm text-muted-foreground">{label}</span>
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-4 top-1/2 mt-[3px] -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>
      )}
      <input
        type="number" inputMode="decimal" min={min} step={step}
        value={value} onChange={(e) => onChange(e.target.value)}
        className={cn(fieldCls, "tabular-nums", prefix && (prefix.length > 2 ? "pl-12" : "pl-9"))}
      />
    </div>
    {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </label>
);

export function Chips<T extends string | number>({
  label, options, value, onChange,
}: {
  label?: ReactNode;
  options: { value: NoInfer<T>; label: string }[];
  value: T;
  onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
              value === o.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The answer block: one headline figure, a caption, and supporting rows. */
export const Result = ({
  label, value, caption, tone = "default", children,
}: {
  label: ReactNode; value: ReactNode; caption?: ReactNode;
  tone?: "default" | "good" | "warn"; children?: ReactNode;
}) => (
  <div className="mt-5 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn(
      "mt-1 text-2xl font-bold tabular-nums",
      tone === "good" && "text-primary",
      tone === "warn" && "text-destructive",
    )}>{value}</p>
    {caption && <p className="mt-1 text-sm text-muted-foreground">{caption}</p>}
    {children && <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">{children}</div>}
  </div>
);

export const Line = ({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn("tabular-nums text-right", strong && "font-semibold")}>{value}</span>
  </div>
);

/**
 * "Keep it in an MMF" toggle with an editable gross rate. Calls back with the
 * net annual rate (after withholding tax), or 0 when off.
 */
export const InterestToggle = ({
  onChange, defaultOn = false, defaultRate = "9", label = "Keep it in a money market fund while it builds",
}: {
  onChange: (netAnnual: number) => void;
  defaultOn?: boolean; defaultRate?: string; label?: string;
}) => {
  const [on, setOn] = useState(defaultOn);
  const [rate, setRate] = useState(defaultRate);
  useEffect(() => {
    onChange(on ? netRate(num(rate) / 100, INTEREST_WHT) : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, rate]);
  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
        <span className="text-sm">{label}</span>
      </label>
      {on && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7 text-sm">
          <input
            type="number" inputMode="decimal" min={0} step="0.1" value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-20 rounded-lg border border-border bg-input px-3 py-1.5 text-right tabular-nums focus:border-primary focus:outline-none"
          />
          <span className="text-muted-foreground">% a year before tax (15% withholding is taken off)</span>
        </div>
      )}
    </div>
  );
};

/** One line explaining where the "typical month" figure came from. */
export const IncomeNote = ({ income }: { income: TypicalIncome }) => {
  const { user } = useAuth();
  if (!user) return <span>Type what a normal month brings in. SIPE works this out from your payments once you sign up.</span>;
  return (
  <span>
    {income.basis === "median" && `Your typical month: the median of the last ${income.monthsUsed} month${income.monthsUsed === 1 ? "" : "s"} of income.`}
    {income.basis === "this-month" && "Based on this month so far. It gets more accurate after a full month."}
    {income.basis === "none" && "No income recorded yet, so type what a normal month brings in."}
  </span>
  );
};

export const PrimaryButton = ({ children, onClick, disabled, type = "button" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
}) => (
  <button
    type={type} onClick={onClick} disabled={disabled}
    className="mt-5 w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary-glow disabled:opacity-50"
  >
    {children}
  </button>
);

/**
 * "Make this a goal" for signed-in users. Visitors on the public calculators
 * page get a sign-up link instead.
 */
export const MakeGoalButton = ({ onClick, saving, disabled, children }: {
  onClick: () => void; saving: boolean; disabled?: boolean; children?: ReactNode;
}) => {
  const { user } = useAuth();
  if (!user) {
    return (
      <Link
        to="/register"
        className="mt-5 block w-full rounded-xl bg-primary py-3 text-center font-semibold text-primary-foreground transition hover:bg-primary-glow"
      >
        Create an account to track this
      </Link>
    );
  }
  return (
    <PrimaryButton onClick={onClick} disabled={saving || disabled}>
      {saving ? "Creating…" : children ?? "Make this a goal"}
    </PrimaryButton>
  );
};

export interface PlannedGoal {
  name: string;
  target: number;
  targetDate: Date | null;
  /** % of each deposit. Null creates a manual goal. */
  depositPct: number | null;
  icon?: string;
  /** The bill this goal pre-pays. */
  billId?: string | null;
}

/** Create a goal from a calculator result. Returns true on success. */
export function useCreatePlannedGoal(userId: string | undefined) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const create = async (g: PlannedGoal) => {
    if (!userId || saving) return false;
    setSaving(true);
    const { data: last } = await supabase
      .from("goals").select("sort_order").eq("user_id", userId)
      .order("sort_order", { ascending: false }).limit(1);
    const pct = g.depositPct != null ? Math.min(100, Math.max(0.5, Math.ceil(g.depositPct * 2) / 2)) : null;
    const { error } = await supabase.from("goals").insert({
      user_id: userId,
      name: g.name,
      icon: g.icon ?? "Target",
      target_amount: Math.round(g.target),
      target_date: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null,
      funding: pct != null ? "deposit_pct" : "manual",
      deposit_pct: pct,
      bill_id: g.billId ?? null,
      sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(pct != null ? `Goal created: ${pct}% of every deposit goes to it` : "Goal created");
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    return true;
  };
  return { create, saving };
}
