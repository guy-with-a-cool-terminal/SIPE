import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ExpenseTemplate } from "@/integrations/supabase/types";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import {
  AHEAD_STEPS as AHEAD, addMonths, grow, incomeNeeded, monthlyEquivalent, monthlyNeeded, monthsToReach, monthsUntil,
} from "@/lib/planner";
import {
  Chips, IncomeNote, InterestToggle, Line, MakeGoalButton, NumberField, Result,
  fieldCls, fmtMonthYear, kes, num, useCreatePlannedGoal, useSeed,
} from "./parts";

const isoIn = (months: number) => addMonths(new Date(), months).toISOString().slice(0, 10);

/**
 * "How do I get N months ahead on a bill?" Pick a bill, how far ahead, and
 * either a date or a share of each payment; the other one is worked out.
 */
export const GetAheadPlanner = ({
  open, onClose, bill,
}: {
  open: boolean;
  onClose: () => void;
  /** Open with this bill already picked. */
  bill?: ExpenseTemplate | null;
}) => {
  const { user } = useAuth();
  const { data, loading } = usePlannerData();
  const { create, saving } = useCreatePlannedGoal(user?.id);

  const [billId, setBillId] = useState("");
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("");
  const [ahead, setAhead] = useState<number>(3);
  const [saved, setSaved] = useState("0");
  const [mode, setMode] = useState<"date" | "share">("date");
  const [date, setDate] = useState(isoIn(12));
  const [share, setShare] = useState("10");
  const [income, setIncome] = useState("");
  const [rate, setRate] = useState(0);

  const pickBill = (id: string, list = data.bills) => {
    setBillId(id);
    const b = list.find((x) => x.id === id);
    if (!b) return;
    setName(b.name);
    setMonthly(String(Math.round(monthlyEquivalent(Number(b.amount), b.every_months))));
    if (b.every_months > 1) setAhead(b.every_months);
  };

  useSeed(open, !loading, () => {
    setIncome(data.income.monthly > 0 ? String(Math.round(data.income.monthly)) : "");
    setSaved("0");
    setMode("date");
    setDate(isoIn(12));
    setAhead(3);
    const first = bill ?? null;
    if (first) pickBill(first.id, data.bills.some((b) => b.id === first.id) ? data.bills : [first]);
    else { setBillId(""); setName(""); setMonthly(""); }
  });

  const m = num(monthly);
  const inc = num(income);
  const target = m * ahead;
  const have = num(saved);

  const plan = useMemo(() => {
    if (target <= 0) return null;
    if (mode === "date") {
      const months = monthsUntil(new Date(date));
      const perMonth = monthlyNeeded(target, have, months, rate);
      return { months, perMonth, finish: new Date(date) };
    }
    const perMonth = inc * (num(share) / 100);
    const months = monthsToReach(target, have, perMonth, rate);
    return { months, perMonth, finish: months != null ? addMonths(new Date(), months) : null };
  }, [target, mode, date, have, rate, inc, share]);

  const sharePct = plan && inc > 0 ? (plan.perMonth / inc) * 100 : null;
  const earnAtSavings = plan ? incomeNeeded(plan.perMonth, data.split.S) : null;
  const interest = plan && plan.months != null && rate > 0 ? grow(have, plan.perMonth, rate, plan.months).interest : 0;

  // When each step of the ladder is reached at this pace.
  const steps = plan && plan.perMonth > 0
    ? AHEAD.filter((n) => n <= ahead).map((n) => ({ n, months: monthsToReach(m * n, have, plan.perMonth, rate) }))
    : [];

  const makeGoal = async () => {
    if (!plan) return;
    const ok = await create({
      name: `${name.trim() || "Bills"}: ${ahead} month${ahead === 1 ? "" : "s"} ahead`,
      target,
      targetDate: plan.finish,
      depositPct: sharePct,
      icon: /rent|house|home/i.test(name) ? "House" : "ShieldCheck",
      billId: billId || null,
    });
    if (ok) onClose();
  };

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title="Get ahead on a bill"
      description="Save up months of a bill so it stops being a monthly worry."
    >
      <div className="space-y-4">
        {data.bills.length > 0 && (
          <label className="block">
            <span className="text-sm text-muted-foreground">Bill</span>
            <select value={billId} onChange={(e) => (e.target.value ? pickBill(e.target.value) : setBillId(""))} className={fieldCls}>
              <option value="">Something else</option>
              {data.bills.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {!billId && (
          <label className="block">
            <span className="text-sm text-muted-foreground">What is it for?</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent, Wifi" className={fieldCls} />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Costs per month" value={monthly} onChange={setMonthly} />
          <NumberField label="Already set aside" value={saved} onChange={setSaved} />
        </div>

        <Chips
          label="How far ahead?"
          value={ahead}
          onChange={setAhead}
          options={AHEAD.map((n) => ({ value: n, label: n === 1 ? "1 month" : `${n} months` }))}
        />

        <Chips
          label="Plan by"
          value={mode}
          onChange={setMode}
          options={[{ value: "date", label: "A date" }, { value: "share", label: "A share of each payment" }]}
        />

        <div className="grid grid-cols-2 gap-3">
          {mode === "date" ? (
            <label className="block min-w-0">
              <span className="text-sm text-muted-foreground">Ready by</span>
              <input type="date" value={date} min={isoIn(1)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </label>
          ) : (
            <NumberField label="Share of each payment" prefix="%" value={share} onChange={setShare} step="0.5" />
          )}
          <NumberField label="Typical month's income" value={income} onChange={setIncome} />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground"><IncomeNote income={data.income} /></p>

        <InterestToggle onChange={setRate} />
      </div>

      {plan && (
        <Result
          label={`${ahead} month${ahead === 1 ? "" : "s"} of ${name.trim() || "this bill"} = ${kes(target)}`}
          value={plan.months == null ? "Not reachable" : `${kes(plan.perMonth)} a month`}
          tone={plan.months == null ? "warn" : "default"}
          caption={
            plan.months == null
              ? "At this share it never gets there. Raise the share or the income."
              : mode === "date"
                ? `Put this aside every month until ${fmtMonthYear(plan.finish!)}.`
                : `Ready around ${fmtMonthYear(plan.finish!)} (${plan.months} month${plan.months === 1 ? "" : "s"}).`
          }
        >
          {sharePct != null && plan.months != null && (
            <Line label="Share of a typical month" value={`${sharePct.toFixed(1)}%`} strong />
          )}
          {earnAtSavings != null && plan.months != null && plan.perMonth > 0 && (
            <Line
              label={user ? `Income needed if it comes from your ${data.split.S}% savings share` : `Income needed if it comes from a ${data.split.S}% savings share`}
              value={`${kes(earnAtSavings)} a month`}
            />
          )}
          {interest > 0 && <Line label="Interest earned along the way" value={`+${kes(interest)}`} />}
          {rate > 0 && plan.months != null && (
            <Line label={`Stay ${ahead} months ahead and the interest pays`} value={`~${kes((target * rate) / 12)} a month`} />
          )}
          {steps.length > 1 && (
            <div className="pt-2">
              <p className="mb-1 text-xs text-muted-foreground">Steps along the way</p>
              {steps.map((s) => (
                <Line
                  key={s.n}
                  label={`${s.n} month${s.n === 1 ? "" : "s"} ahead (${kes(m * s.n)})`}
                  value={s.months == null ? "Not reached" : s.months === 0 ? "Already there" : fmtMonthYear(addMonths(new Date(), s.months))}
                />
              ))}
            </div>
          )}
          {sharePct != null && sharePct > 100 && (
            <p className="pt-1 text-sm text-destructive">That's more than a typical month brings in. Push the date out or plan a smaller step first.</p>
          )}
        </Result>
      )}

      {plan && plan.months != null && plan.perMonth > 0 && (
        <>
          <MakeGoalButton onClick={makeGoal} saving={saving} disabled={sharePct != null && sharePct > 100}>
            {sharePct != null ? `Make this a goal (${(Math.ceil(sharePct * 2) / 2)}% of every deposit)` : "Make this a goal"}
          </MakeGoalButton>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Your normal monthly bills still come out of the Expenses bucket. This is extra.
          </p>
        </>
      )}
    </ResponsiveModal>
  );
};
