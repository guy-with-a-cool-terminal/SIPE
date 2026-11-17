import { cn } from "@/lib/utils";
import { TIER_LABEL, type Tier } from "@/lib/clientPriority";

const TONE: Record<Tier, string> = {
  top: "bg-primary/10 text-primary",
  regular: "bg-secondary text-foreground",
  occasional: "bg-secondary text-muted-foreground",
  new: "border border-border text-muted-foreground",
};

const HINT: Record<Tier, string> = {
  top: "Together these clients make up 80% of what you were paid in the last 12 months",
  regular: "The next 15% of what you were paid in the last 12 months",
  occasional: "The last 5% of your income, or nothing in the last 12 months",
  new: "Hasn't paid you through SIPE yet",
};

export const TierBadge = ({ tier, className }: { tier: Tier; className?: string }) => (
  <span title={HINT[tier]} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE[tier], className)}>
    {TIER_LABEL[tier]}
  </span>
);
