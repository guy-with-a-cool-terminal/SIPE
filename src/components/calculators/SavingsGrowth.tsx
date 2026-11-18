import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import { cn } from "@/lib/utils";
import { SAVINGS_OPTIONS, projectOptions, type SavingsOption } from "@/lib/planner";
import { Chips, NumberField, kes, num, useSeed } from "./parts";

const RATES_KEY = "sipe.savingsRates";

/** Rates the viewer has typed in, kept on this device only. */
function loadRates(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(RATES_KEY) || "{}") || {}; } catch { return {}; }
}
function saveRates(r: Record<string, string>) {
  try { localStorage.setItem(RATES_KEY, JSON.stringify(r)); } catch { /* private mode */ }
}

const pctLabel = (r: number) => `${(r * 100).toFixed(r * 100 % 1 ? 1 : 0)}%`;

/**
 * "What could my savings earn?" Starts from the Savings bucket balance plus
 * what the split keeps adding, and compares where that money could sit.
 */
export const SavingsGrowth = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const { data, loading } = usePlannerData();
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState("");
  const [months, setMonths] = useState<number>(12);
  const [rates, setRates] = useState<Record<string, string>>({});

  useSeed(open, !loading, () => {
    setAmount(String(Math.max(0, Math.round(data.savingsBalance))));
    setAdding(data.income.monthly > 0 ? String(Math.round((data.income.monthly * data.split.S) / 100)) : "0");
    setMonths(12);
    setRates(loadRates());
  });

  const setRate = (key: string, v: string) => {
    const next = { ...rates, [key]: v };
    setRates(next);
    saveRates(next);
  };

  const options: SavingsOption[] = useMemo(
    () => SAVINGS_OPTIONS.map((o) => (rates[o.key] != null && rates[o.key] !== "" ? { ...o, grossRate: num(rates[o.key]) / 100 } : o)),
    [rates],
  );

  const a = num(amount);
  const add = num(adding);
  const rows = useMemo(() => projectOptions(a, add, months, options), [a, add, months, options]);
  const idle = rows.find((r) => r.option.key === "idle")!;
  const eligible = rows.filter((r) => !r.belowMinimum && r.option.key !== "idle");
  const best = eligible.reduce<(typeof rows)[number] | null>((b, r) => (!b || r.balance > b.balance ? r : b), null);
  const mmf = rows.find((r) => r.option.key === "mmf")!;

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      className="md:max-w-2xl"
      title="What could my savings earn?"
      description="Where your savings could sit, and what each option grows them to."
    >
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Saved now" value={amount} onChange={setAmount} hint={user ? "Your Savings bucket balance." : undefined} />
        <NumberField
          label="Added each month" value={adding} onChange={setAdding}
          hint={data.income.monthly > 0 ? `${data.split.S}% of a typical month.` : "What you put away monthly."}
        />
      </div>
      <div className="mt-4">
        <Chips
          label="Over"
          value={months}
          onChange={setMonths}
          options={[6, 12, 24].map((n) => ({ value: n, label: n === 24 ? "2 years" : `${n} months` }))}
        />
      </div>

      {a + add > 0 && (
        <div className="mt-5 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">In {months === 24 ? "2 years" : `${months} months`}, left as it is</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{kes(idle.balance)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            In a money market fund: <span className="font-semibold text-primary">{kes(mmf.balance)}</span>, which is{" "}
            <span className="font-semibold text-primary">{kes(mmf.interest)}</span> earned after tax
            {months >= 12 && mmf.interest > 0 && <> (about {kes(mmf.interest / months)} a month)</>}.
          </p>
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Option</th>
              <th className="px-3 py-2 font-medium">Rate a year</th>
              <th className="px-3 py-2 text-right font-medium">Earned</th>
              <th className="px-3 py-2 text-right font-medium">You'd have</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const isBest = best?.option.key === r.option.key && r.interest > 0;
              return (
                <tr key={r.option.key} className={cn(r.belowMinimum && "text-muted-foreground")}>
                  <td className="px-3 py-2.5 align-top">
                    <p className={cn("font-medium", isBest && "text-primary")}>
                      {r.option.name}{isBest && " (most)"}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.option.access}. {r.option.note}</p>
                    {r.belowMinimum && (
                      <p className="text-xs text-destructive">Needs at least {kes(r.option.minimum!)} to start.</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {r.option.key === "idle" ? (
                      <span className="tabular-nums">0%</span>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" inputMode="decimal" min={0} step="0.1"
                            aria-label={`${r.option.name} rate`}
                            value={rates[r.option.key] ?? String(+(r.option.grossRate * 100).toFixed(2))}
                            onChange={(e) => setRate(r.option.key, e.target.value)}
                            className="w-16 rounded-md border border-border bg-input px-2 py-1 text-right tabular-nums focus:border-primary focus:outline-none"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.option.taxRate > 0 ? `${pctLabel(r.netRate)} after tax` : "tax-free"}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {r.interest > 0 ? `+${kes(r.interest)}` : "–"}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums">{kes(r.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Rates are examples and change with the Central Bank rate. Type in what the provider quotes today; your numbers are remembered on this device.
        Tax is the 15% withholding on interest (5% on SACCO payouts; infrastructure bonds are tax-free). Locked options pay more because you can't touch the money, so keep a few months of bills somewhere you can reach.
      </p>
      {user ? (
        <p className="mt-3 text-sm">
          Moved some?{" "}
          <Link to="/accounts" onClick={onClose} className="font-medium text-primary hover:text-primary/80">
            Add it as an account
          </Link>{" "}
          so SIPE keeps tracking it.
        </p>
      ) : (
        <p className="mt-3 text-sm">
          <Link to="/register" className="font-medium text-primary hover:text-primary/80">Create an account</Link>{" "}
          and SIPE fills this in from your real savings and keeps it up to date.
        </p>
      )}
    </ResponsiveModal>
  );
};
