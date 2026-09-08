import { Skeleton } from "@/components/ui/skeleton";

/** A stack of list rows, matching the transaction / item row shape.
 *  Pass `plain` when the caller already provides a `.glass` container. */
export const ListSkeleton = ({ rows = 5, plain = false }: { rows?: number; plain?: boolean }) => {
  const inner = Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="size-8 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-4 w-16 flex-shrink-0" />
    </div>
  ));
  if (plain) return <div className="divide-y divide-border">{inner}</div>;
  return <div className="glass rounded-2xl divide-y divide-border overflow-hidden">{inner}</div>;
};

/** A responsive grid of card placeholders. */
export const CardGridSkeleton = ({
  count = 4,
  className = "grid grid-cols-2 xl:grid-cols-4 gap-3",
}: {
  count?: number;
  className?: string;
}) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass rounded-xl p-4 space-y-3">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-1 w-full" />
      </div>
    ))}
  </div>
);
