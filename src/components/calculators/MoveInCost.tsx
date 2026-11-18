import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import { addMonths, monthlyEquivalent, monthlyNeeded, monthsUntil, moveInTotal } from "@/lib/planner";
import { Line, MakeGoalButton, NumberField, Result, fieldCls, fmtMonthYear, kes, num, useCreatePlannedGoal, useSeed } from "./parts";

const isoIn = (months: number) => addMonths(new Date(), months).toISOString().slice(0, 10);

const EXTRAS = [
  { key: "agent", label: "Agent or finder's fee" },
  { key: "water", label: "Water deposit" },
  { key: "power", label: "Power deposit" },
  { key: "moving", label: "Moving and transport" },
  { key: "setup", label: "Furniture and setup" },
] as const;

type ExtraKey = (typeof EXTRAS)[number]["key"];

/** "What does moving into that place really cost?" Everything due on day one, as one goal. */
export const MoveInCost = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const { data, loading } = usePlannerData();
  const { create, saving } = useCreatePlannedGoal(user?.id);

  const [rent, setRent] = useState("");
  const [depositMonths, setDepositMonths] = useState("1");
  const [advanceMonths, setAdvanceMonths] = useState("1");
  const [extras, setExtras] = useState<Record<ExtraKey, string>>({ agent: "", water: "", power: "", moving: "", setup: "" });
  const [date, setDate] = useState(isoIn(3));

  useSeed(open, !loading, () => {
    const rentBill = data.bills.find((b) => /rent/i.test(b.name));
    setRent(rentBill ? String(Math.round(monthlyEquivalent(Number(rentBill.amount), rentBill.every_months))) : "");
    setDepositMonths("1");
    setAdvanceMonths("1");
    setExtras({ agent: "", water: "", power: "", moving: "", setup: "" });
    setDate(isoIn(3));
  });

  const total = moveInTotal({
    rent: num(rent),
    depositMonths: num(depositMonths),
    advanceMonths: num(advanceMonths),
    extras: EXTRAS.map((e) => num(extras[e.key])),
  });

  const plan = useMemo(() => {
    if (total <= 0) return null;
    const months = monthsUntil(new Date(date));
    const perMonth = monthlyNeeded(total, 0, months, 0);
    const share = data.income.monthly > 0 ? (perMonth / data.income.monthly) * 100 : null;
    return { months, perMonth, share };
  }, [total, date, data.income.monthly]);

  const makeGoal = async () => {
    if (!plan) return;
    const ok = await create({
      name: "Move-in costs",
      target: total,
      targetDate: new Date(date),
      depositPct: plan.share != null && plan.share <= 100 ? plan.share : null,
      icon: "House",
    });
    if (ok) onClose();
  };

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title="Move-in cost"
      description="Everything a new place asks for on day one, in one number."
    >
      <div className="space-y-4">
        <NumberField label="Rent per month" value={rent} onChange={setRent} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Deposit (months of rent)" prefix="" step="1" value={depositMonths} onChange={setDepositMonths} />
          <NumberField label="Rent paid in advance (months)" prefix="" step="1" value={advanceMonths} onChange={setAdvanceMonths} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {EXTRAS.map((e) => (
            <NumberField key={e.key} label={e.label} value={extras[e.key]} onChange={(v) => setExtras((x) => ({ ...x, [e.key]: v }))} />
          ))}
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">Moving in by</span>
          <input type="date" value={date} min={isoIn(1)} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
        </label>
      </div>

      {total > 0 && (
        <Result label="Total to move in" value={kes(total)} caption={plan ? `${kes(plan.perMonth)} a month until ${fmtMonthYear(new Date(date))}.` : undefined}>
          <Line label="Deposit" value={kes(num(rent) * num(depositMonths))} />
          <Line label="Rent in advance" value={kes(num(rent) * num(advanceMonths))} />
          <Line label="Everything else" value={kes(EXTRAS.reduce((s, e) => s + num(extras[e.key]), 0))} />
          {plan?.share != null && <Line label="Share of a typical month" value={`${plan.share.toFixed(1)}%`} strong />}
        </Result>
      )}

      {plan && (
        <MakeGoalButton onClick={makeGoal} saving={saving} />
      )}
    </ResponsiveModal>
  );
};
