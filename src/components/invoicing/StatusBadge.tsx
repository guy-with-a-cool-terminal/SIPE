import { cn } from "@/lib/utils";
import { STATUS_LABEL, type DisplayStatus } from "@/lib/invoicing";

// Color is never the only signal: every badge carries its label.
const TONE: Record<DisplayStatus, string> = {
  draft:    "bg-secondary text-muted-foreground",
  sent:     "bg-primary/15 text-primary",
  partial:  "bg-warning/15 text-warning",
  overdue:  "bg-destructive/15 text-destructive",
  paid:     "bg-primary text-primary-foreground",
  void:     "bg-secondary text-muted-foreground line-through",
  accepted: "bg-primary text-primary-foreground",
  declined: "bg-secondary text-muted-foreground",
  expired:  "bg-warning/15 text-warning",
};

export const StatusBadge = ({ status, className }: { status: DisplayStatus; className?: string }) => (
  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[status], className)}>
    {STATUS_LABEL[status]}
  </span>
);

/** Marks a quote / invoice whose payments don't count as income. */
export const PassThroughBadge = () => (
  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap" title="Payments don't count as income">
    Pass-through
  </span>
);
