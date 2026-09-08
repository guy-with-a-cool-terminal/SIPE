import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  /** Column header (desktop table only). */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Extra classes on the `<td>` / `<th>`. */
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  /** Mobile card renderer for one row. */
  renderCard: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Width at which the table replaces the card list. Default `md`. */
  breakpoint?: "sm" | "md";
  className?: string;
}

/**
 * A list that renders as a `<table>` on wide screens and a stack of cards on
 * narrow ones. See docs/design/DESIGN_SYSTEM.md §5.5.
 *
 * The caller owns loading / empty states and any surrounding `.glass` container.
 */
export function DataList<T>({
  rows,
  columns,
  keyOf,
  renderCard,
  onRowClick,
  breakpoint = "md",
  className,
}: Props<T>) {
  const cardHidden = breakpoint === "md" ? "md:hidden" : "sm:hidden";
  const tableHidden = breakpoint === "md" ? "hidden md:block" : "hidden sm:block";

  return (
    <div className={className}>
      <ul className={cn(cardHidden, "divide-y divide-border")}>
        {rows.map((row) => (
          <li
            key={keyOf(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={onRowClick ? "cursor-pointer active:bg-secondary/20" : undefined}
          >
            {renderCard(row)}
          </li>
        ))}
      </ul>

      <div className={cn(tableHidden, "overflow-x-auto")}>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={cn("px-4 py-3", c.align === "right" ? "text-right" : "text-left", c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={keyOf(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "hover:bg-secondary/20 cursor-pointer" : undefined}
              >
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn("px-4 py-3", c.align === "right" ? "text-right" : "text-left", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
