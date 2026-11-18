import { useMemo, useState } from "react";
import type { ExpenseTemplate } from "@/integrations/supabase/types";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { INTEREST_WHT, monthlyEquivalent, netRate, prepayOrKeep } from "@/lib/planner";
import { Chips, Line, NumberField, Result, kes, num, useSeed } from "./parts";

/**
 * "Should I pay upfront?" Compares the provider's discount for paying N months
 * at once against the interest from keeping the money and paying monthly.
 */
export const PrepayOrKeep = ({
  open, onClose, bill,
}: {
  open: boolean;
  onClose: () => void;
  bill?: ExpenseTemplate | null;
}) => {
  const [monthly, setMonthly] = useState("");
  const [months, setMonths] = useState<number>(12);
  const [discount, setDiscount] = useState("0");
  const [rate, setRate] = useState("9");

  useSeed(open, true, () => {
    setMonthly(bill ? String(Math.round(monthlyEquivalent(Number(bill.amount), bill.every_months))) : "");
    setMonths(bill && bill.every_months > 1 ? bill.every_months : 12);
    setDiscount("0");
  });

  const m = num(monthly);
  const r = useMemo(
    () => (m > 0 ? prepayOrKeep(m, months, num(discount), netRate(num(rate) / 100, INTEREST_WHT)) : null),
    [m, months, discount, rate],
  );

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title={bill ? `Pay ${bill.name} upfront?` : "Pay upfront or keep it?"}
      description="Paying months at once only makes sense if the discount beats what the money earns sitting in a fund."
    >
      <div className="space-y-4">
        <NumberField label="Costs per month" value={monthly} onChange={setMonthly} />
        <Chips
          label="Months paid at once"
          value={months}
          onChange={setMonths}
          options={[3, 6, 12].map((n) => ({ value: n, label: `${n} months` }))}
        />
        <div>
          <NumberField label="Discount for paying upfront" value={discount} onChange={setDiscount} hint="Ask the landlord or provider. Zero if there is none." />
          {m > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0.5, 1].map((f) => (
                <button
                  key={f} type="button" onClick={() => setDiscount(String(Math.round(m * f)))}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-secondary/40 hover:text-foreground"
                >
                  {f === 1 ? "1 month free" : "Half a month off"}
                </button>
              ))}
            </div>
          )}
        </div>
        <NumberField label="What a money market fund pays" prefix="%" step="0.1" value={rate} onChange={setRate} hint="A year, before the 15% withholding tax. Check the fund's current rate." />
      </div>

      {r && (
        <Result
          label="Better choice"
          value={r.verdict === "prepay" ? "Pay upfront" : r.verdict === "keep" ? "Keep it and pay monthly" : "About the same"}
          tone={r.verdict === "same" ? "default" : "good"}
          caption={
            r.verdict === "prepay"
              ? `The discount is worth ${kes(r.margin)} more than the interest.`
              : r.verdict === "keep"
                ? `The fund earns ${kes(r.margin)} more than the discount, and the money stays yours if plans change.`
                : "Pick whichever gives you more peace of mind."
          }
        >
          <Line label={`Pay upfront for ${months} months`} value={kes(r.upfront)} />
          <Line label="Discount" value={kes(num(discount))} />
          <Line label="Interest if you keep it and pay monthly" value={kes(r.keepInterest)} />
        </Result>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Paying a landlord upfront also carries risk: if you move out early or the house changes hands, getting money back can be hard. Prepaying power tokens or bulk dry food carries much less.
      </p>
    </ResponsiveModal>
  );
};
