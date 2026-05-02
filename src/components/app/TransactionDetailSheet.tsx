import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BUCKET_META, formatKES, type Transaction } from "@/integrations/supabase/types";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface Props {
  transaction: Transaction | null;
  allRows: Transaction[];
  onClose: () => void;
}

export const TransactionDetailSheet = ({ transaction, allRows, onClose }: Props) => {
  if (!transaction) return null;

  const isDeposit = transaction.type === "income" && transaction.parent_id === null;
  const isSplitExpense = transaction.type === "expense" && transaction.bucket === null;
  const showBreakdown = isDeposit || isSplitExpense;
  const children = allRows.filter(r => r.parent_id === transaction.id);

  const dateStr = new Date(transaction.occurred_at).toLocaleDateString("en-KE", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl grid place-items-center flex-shrink-0 ${transaction.type === "income" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {transaction.type === "income"
                ? <ArrowDownRight className="size-5" />
                : <ArrowUpRight className="size-5" />
              }
            </div>
            <div>
              <SheetTitle className="text-base">
                {transaction.type === "income" ? "Deposit" : isSplitExpense ? "Split Expense" : "Expense"}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Amount */}
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
          <p className={`text-3xl font-bold ${transaction.type === "income" ? "text-primary" : ""}`}>
            {transaction.type === "income" ? "+" : "−"}{formatKES(Number(transaction.amount))}
          </p>
        </div>

        {/* Metadata */}
        <div className="space-y-4 mb-6">
          {transaction.description && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm">{transaction.description}</p>
            </div>
          )}
          {transaction.category && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Category</p>
              <p className="text-sm">{transaction.category}</p>
            </div>
          )}
          {isDeposit && transaction.source && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Source</p>
              <p className="text-sm">{transaction.source}</p>
            </div>
          )}
          {!showBreakdown && transaction.bucket && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bucket</p>
              <span
                className="inline-block px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: `hsl(${BUCKET_META[transaction.bucket].color} / 0.15)`,
                  color: `hsl(${BUCKET_META[transaction.bucket].color})`,
                }}
              >
                {BUCKET_META[transaction.bucket].name}
              </span>
            </div>
          )}
        </div>

        {/* Split breakdown */}
        {showBreakdown && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              {isDeposit ? "Bucket allocations" : "Split breakdown"}
            </p>
            {children.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No allocation data found — this may be a legacy deposit.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-border">
                {children.map((child, i) => {
                  const meta = child.bucket ? BUCKET_META[child.bucket] : null;
                  return (
                    <div
                      key={child.id}
                      className={`flex items-center justify-between px-4 py-3 ${i < children.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        {meta && child.bucket && (
                          <span
                            className="size-6 rounded-md grid place-items-center text-xs font-bold flex-shrink-0"
                            style={{
                              backgroundColor: `hsl(${meta.color} / 0.15)`,
                              color: `hsl(${meta.color})`,
                            }}
                          >
                            {child.bucket}
                          </span>
                        )}
                        <span className="text-sm">{meta ? meta.name : "—"}</span>
                      </div>
                      <span className={`text-sm font-semibold ${isDeposit ? "text-primary" : ""}`}>
                        {isDeposit ? "+" : "−"}{formatKES(Number(child.amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
