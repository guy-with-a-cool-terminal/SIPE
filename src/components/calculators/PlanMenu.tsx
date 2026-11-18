import { useState } from "react";
import { Calculator } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GetAheadPlanner } from "./GetAheadPlanner";
import { EarningsTarget } from "./EarningsTarget";
import { MoveInCost } from "./MoveInCost";
import { SavingsGrowth } from "./SavingsGrowth";
import { ExpensesCheck } from "./ExpensesCheck";

type Kind = "getAhead" | "earn" | "moveIn" | "savings" | "expenses";

const ITEMS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "getAhead", label: "Get ahead on a bill", hint: "Months of rent or wifi saved up" },
  { kind: "earn", label: "What do I need to earn?", hint: "Work back from a target" },
  { kind: "moveIn", label: "Move-in cost", hint: "Deposit, advance and the extras" },
  { kind: "savings", label: "What could my savings earn?", hint: "MMF, fixed deposit, T-bills" },
  { kind: "expenses", label: "Is my Expenses % enough?", hint: "Bills against your split" },
];

/** A "Plan" button that opens any of the planning calculators. Used on Goals. */
export const PlanMenu = ({ only }: { only?: Kind[] }) => {
  const [open, setOpen] = useState<Kind | null>(null);
  const close = () => setOpen(null);
  const items = only ? ITEMS.filter((i) => only.includes(i.kind)) : ITEMS;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:bg-secondary">
            <Calculator className="size-4" /> Plan
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {items.map((i) => (
            <DropdownMenuItem key={i.kind} onSelect={() => setOpen(i.kind)} className="flex flex-col items-start gap-0.5 py-2">
              <span className="text-sm font-medium">{i.label}</span>
              <span className="text-xs text-muted-foreground">{i.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <GetAheadPlanner open={open === "getAhead"} onClose={close} />
      <EarningsTarget open={open === "earn"} onClose={close} />
      <MoveInCost open={open === "moveIn"} onClose={close} />
      <SavingsGrowth open={open === "savings"} onClose={close} />
      <ExpensesCheck open={open === "expenses"} onClose={close} />
    </>
  );
};
