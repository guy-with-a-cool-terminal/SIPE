import { useMemo, useState } from "react";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import { rateFor } from "@/lib/planner";
import { Line, NumberField, Result, kes, num, useSeed } from "./parts";

/** "What should I charge?" Income target and billable time in, hourly and day rate out. */
export const RateSetter = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { data, loading } = usePlannerData();
  const [need, setNeed] = useState("");
  const [costs, setCosts] = useState("0");
  const [hours, setHours] = useState("25");
  const [weeksOff, setWeeksOff] = useState("4");
  const [tax, setTax] = useState("0");

  useSeed(open, !loading, () => {
    // Start from whatever is bigger: a typical month, or the income the split
    // needs so that the Expenses share covers the bills.
    const forBills = data.split.E > 0 ? data.billsMonthly / (data.split.E / 100) : 0;
    const start = Math.max(data.income.monthly, forBills);
    setNeed(start > 0 ? String(Math.round(start)) : "");
  });

  const r = useMemo(() => rateFor({
    monthlyNeed: num(need),
    monthlyCosts: num(costs),
    billableHoursPerWeek: num(hours),
    weeksOff: num(weeksOff),
    taxPct: num(tax),
  }), [need, costs, hours, weeksOff, tax]);

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title="What should I charge?"
      description="Start from the income you need and the hours you can actually bill."
    >
      <div className="space-y-4">
        <NumberField
          label="Income you need a month"
          value={need} onChange={setNeed}
          hint="Before your split. Prefilled from a typical month, or what your bills need at your Expenses %."
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Business costs a month" value={costs} onChange={setCosts} hint="Tools, data, transport." />
          <NumberField label="Tax you set aside" prefix="%" step="0.5" value={tax} onChange={setTax} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Billable hours a week" prefix="" value={hours} onChange={setHours} hint="Hours clients pay for, not hours worked." />
          <NumberField label="Weeks off a year" prefix="" value={weeksOff} onChange={setWeeksOff} hint="Holidays, sick days, quiet spells." />
        </div>
      </div>

      {r && num(need) > 0 && (
        <Result label="Charge at least" value={`${kes(r.hourly)} an hour`} caption={`Or ${kes(r.daily)} for a full billable day.`}>
          <Line label="Revenue needed a month" value={kes(r.monthlyRevenue)} />
          <Line label="Billable hours a year" value={r.billableHoursPerYear.toLocaleString("en-KE")} />
          {data.income.monthly > 0 && (
            <Line
              label="Compared with a typical month"
              value={r.monthlyRevenue > data.income.monthly
                ? `${kes(r.monthlyRevenue - data.income.monthly)} short`
                : "covered"}
            />
          )}
        </Result>
      )}
      {!r && <p className="mt-4 text-sm text-destructive">Billable hours and weeks need to leave some working time.</p>}
    </ResponsiveModal>
  );
};
