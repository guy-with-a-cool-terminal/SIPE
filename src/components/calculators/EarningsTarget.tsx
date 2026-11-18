import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import { addMonths, incomeNeeded, monthlyNeeded, monthsUntil } from "@/lib/planner";
import {
  IncomeNote, InterestToggle, Line, MakeGoalButton, NumberField, Result,
  fieldCls, fmtMonthYear, kes, num, useCreatePlannedGoal, useSeed,
} from "./parts";

const isoIn = (months: number) => addMonths(new Date(), months).toISOString().slice(0, 10);

/**
 * "What do I need to earn to hit this?" Works backwards from a target and a
 * date to the monthly income needed, and the extra payments that means.
 */
export const EarningsTarget = ({
  open, onClose, defaultTarget,
}: {
  open: boolean;
  onClose: () => void;
  defaultTarget?: number;
}) => {
  const { user } = useAuth();
  const { data, loading } = usePlannerData();
  const { create, saving } = useCreatePlannedGoal(user?.id);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("0");
  const [date, setDate] = useState(isoIn(12));
  const [share, setShare] = useState("15");
  const [income, setIncome] = useState("");
  const [avgPay, setAvgPay] = useState("");
  const [rate, setRate] = useState(0);

  useSeed(open, !loading, () => {
    setName("");
    setTarget(defaultTarget ? String(Math.round(defaultTarget)) : "");
    setSaved("0");
    setDate(isoIn(12));
    setShare(String(data.split.S || 15));
    setIncome(data.income.monthly > 0 ? String(Math.round(data.income.monthly)) : "");
    setAvgPay(data.income.avgPayment > 0 ? String(Math.round(data.income.avgPayment)) : "");
  });

  const t = num(target);
  const inc = num(income);
  const sh = num(share);

  const r = useMemo(() => {
    if (t <= 0) return null;
    const months = monthsUntil(new Date(date));
    const perMonth = monthlyNeeded(t, num(saved), months, rate);
    const need = incomeNeeded(perMonth, sh);
    const gap = need != null ? need - inc : null;
    const avg = num(avgPay);
    const extraPayments = gap != null && gap > 0 && avg > 0 ? gap / avg : null;
    const shareAtCurrent = inc > 0 ? (perMonth / inc) * 100 : null;
    return { months, perMonth, need, gap, extraPayments, shareAtCurrent, avg };
  }, [t, date, saved, rate, sh, inc, avgPay]);

  const makeGoal = async () => {
    if (!r) return;
    const ok = await create({
      name: name.trim() || "Savings target",
      target: t,
      targetDate: new Date(date),
      depositPct: r.shareAtCurrent != null && r.shareAtCurrent <= 100 ? r.shareAtCurrent : null,
      icon: "TrendingUp",
    });
    if (ok) onClose();
  };

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title="What do I need to earn?"
      description="Work backwards from a target to the income that gets you there."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted-foreground">What is it for?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A year of rent" className={fieldCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Target" value={target} onChange={setTarget} />
          <NumberField label="Already saved" value={saved} onChange={setSaved} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="text-sm text-muted-foreground">By</span>
            <input type="date" value={date} min={isoIn(1)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </label>
          <NumberField label="Share of each payment for it" prefix="%" step="0.5" value={share} onChange={setShare} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Typical month's income" value={income} onChange={setIncome} />
          <NumberField label="Average payment from a client" value={avgPay} onChange={setAvgPay} />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground"><IncomeNote income={data.income} /></p>
        <InterestToggle onChange={setRate} />
      </div>

      {r && r.need != null && (
        <Result
          label={`To put aside ${kes(r.perMonth)} a month at ${sh}% of each payment`}
          value={`${kes(r.need)} a month`}
          tone={r.gap != null && r.gap <= 0 ? "good" : "default"}
          caption={
            r.gap == null || inc <= 0
              ? `That's the income needed every month until ${fmtMonthYear(new Date(date))}.`
              : r.gap <= 0
                ? `You already earn enough. Your typical month covers it with ${kes(-r.gap)} to spare.`
                : `${kes(r.gap)} more than your typical month.`
          }
        >
          {r.extraPayments != null && (
            <Line
              label={`Extra payments a month at your average of ${kes(r.avg)}`}
              value={`about ${Math.ceil(r.extraPayments * 10) / 10}`}
              strong
            />
          )}
          {r.shareAtCurrent != null && (
            <Line
              label="Or keep your income and set aside"
              value={r.shareAtCurrent > 100 ? "more than you earn" : `${r.shareAtCurrent.toFixed(1)}% of each payment`}
            />
          )}
          <Line label="Months to go" value={r.months} />
        </Result>
      )}

      {r && r.perMonth > 0 && (
        <MakeGoalButton onClick={makeGoal} saving={saving} />
      )}
    </ResponsiveModal>
  );
};
