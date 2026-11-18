import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { usePlannerData } from "@/hooks/usePlannerData";
import { BILL_INTERVALS, INTERVAL_LABEL, minExpensesPct, monthlyEquivalent } from "@/lib/planner";
import { IncomeNote, Line, NumberField, PrimaryButton, Result, kes, num, useSeed } from "./parts";

interface DraftBill { name: string; amount: string; every: number }

const STARTER: DraftBill[] = [
  { name: "Rent", amount: "", every: 1 },
  { name: "Wifi", amount: "", every: 1 },
  { name: "Electricity", amount: "", every: 1 },
  { name: "Water", amount: "", every: 1 },
  { name: "Food", amount: "", every: 1 },
];

const smallInput = "w-full min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-primary focus:outline-none";

/**
 * "Is my Expenses % enough to pay my bills?" Compares the monthly total of the
 * bills against the Expenses share of a typical month. Uses the saved bills
 * when there are some; otherwise the bills are typed in here.
 */
export const ExpensesCheck = ({
  open, onClose, currentPct, onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** The Expenses % to check. Defaults to the saved split. */
  currentPct?: number;
  /** When given, offers a button to set the Expenses % to the minimum. */
  onApply?: (pct: number) => void;
}) => {
  const { user } = useAuth();
  const { data, loading } = usePlannerData();
  const [income, setIncome] = useState("");
  const [ePctInput, setEPctInput] = useState("");
  const [drafts, setDrafts] = useState<DraftBill[]>(STARTER);

  useSeed(open, !loading, () => {
    setIncome(data.income.monthly > 0 ? String(Math.round(data.income.monthly)) : "");
    setEPctInput(String(currentPct ?? data.split.E));
    setDrafts(STARTER);
  });

  const useSaved = data.bills.length > 0;
  const rows = useSaved
    ? data.bills.map((b) => ({ key: b.id, name: b.name, amount: Number(b.amount), every: b.every_months }))
    : drafts.map((d, i) => ({ key: String(i), name: d.name, amount: num(d.amount), every: d.every }));
  const billsMonthly = rows.reduce((s, r) => s + monthlyEquivalent(r.amount, r.every), 0);

  const inc = num(income);
  const ePct = currentPct ?? num(ePctInput);
  const eAmount = (inc * ePct) / 100;
  const need = minExpensesPct(billsMonthly, inc);
  const gap = billsMonthly - eAmount;
  const ok = gap <= 0;

  const setDraft = (i: number, patch: Partial<DraftBill>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <ResponsiveModal
      open={open} onClose={onClose} size="lg"
      title="Is my Expenses % enough?"
      description="Your bills compared with what the Expenses bucket gets from a typical month."
    >
      {useSaved ? (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((b) => (
            <div key={b.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{b.name}</p>
                {b.every > 1 && (
                  <p className="text-xs text-muted-foreground">{kes(b.amount)} {INTERVAL_LABEL[b.every].toLowerCase()}</p>
                )}
              </div>
              <span className="flex-shrink-0 tabular-nums">{kes(monthlyEquivalent(b.amount, b.every))}/mo</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-secondary/30 px-4 py-2.5 text-sm font-semibold">
            <span>Bills a month</span>
            <span className="tabular-nums">{kes(billsMonthly)}</span>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Your bills</p>
          <div className="space-y-2">
            {drafts.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_6.5rem_auto] items-center gap-2 sm:grid-cols-[1fr_7rem_8.5rem_auto]">
                <input value={d.name} onChange={(e) => setDraft(i, { name: e.target.value })} placeholder="Bill" aria-label="Bill name" className={smallInput} />
                <input
                  type="number" inputMode="decimal" min={0} value={d.amount} placeholder="KES"
                  onChange={(e) => setDraft(i, { amount: e.target.value })} aria-label={`${d.name || "Bill"} amount`}
                  className={`${smallInput} text-right tabular-nums`}
                />
                <select
                  value={d.every} onChange={(e) => setDraft(i, { every: Number(e.target.value) })}
                  aria-label={`${d.name || "Bill"} how often`}
                  className={`${smallInput} col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto`}
                >
                  {BILL_INTERVALS.map((n) => <option key={n} value={n}>{INTERVAL_LABEL[n]}</option>)}
                </select>
                <button
                  type="button" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                  aria-label="Remove bill" className="p-1.5 text-muted-foreground transition hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button" onClick={() => setDrafts((ds) => [...ds, { name: "", amount: "", every: 1 }])}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
            >
              <Plus className="size-4" /> Add a bill
            </button>
            <span className="text-sm font-semibold tabular-nums">{kes(billsMonthly)} a month</span>
          </div>
          {user && (
            <p className="mt-2 text-xs text-muted-foreground">
              These aren't saved.{" "}
              <Link to="/settings?tab=bills" onClick={onClose} className="font-medium text-primary hover:text-primary/80">Save your bills in Settings</Link>{" "}
              to see this everywhere.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField label="Typical month's income" value={income} onChange={setIncome} />
        {currentPct == null && (
          <NumberField label="Expenses share" prefix="%" step="1" value={ePctInput} onChange={setEPctInput} />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground"><IncomeNote income={data.income} /></p>

      {inc > 0 && need != null && billsMonthly > 0 && (
        <Result
          label="Smallest Expenses % that covers your bills"
          value={`${need}%`}
          tone={ok ? "good" : "warn"}
          caption={
            ok
              ? `${ePct}% gives ${kes(eAmount)} a month, which covers them with ${kes(-gap)} to spare.`
              : `${ePct}% gives ${kes(eAmount)} a month, ${kes(gap)} short of your bills.`
          }
        >
          <Line label="Bills as a share of income" value={`${((billsMonthly / inc) * 100).toFixed(1)}%`} />
          {need > 100 && (
            <p className="pt-1 text-destructive">Your bills are more than a typical month brings in.</p>
          )}
        </Result>
      )}

      {onApply && need != null && need !== ePct && need <= 100 && billsMonthly > 0 && (
        <PrimaryButton onClick={() => { onApply(need); onClose(); }}>
          Set Expenses to {need}%
        </PrimaryButton>
      )}
    </ResponsiveModal>
  );
};
