import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page-title treatment. Every protected page renders exactly one.
 * See docs/design/DESIGN_SYSTEM.md §3.
 *
 * `actions` sits to the right on wider screens and wraps below the title on
 * narrow ones. Keep action buttons compact on mobile (icon + short label).
 */
export const PageHeader = ({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
      className,
    )}
  >
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
    {actions && (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    )}
  </div>
);
