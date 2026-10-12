import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, FilePen, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createDraft } from "@/hooks/useInvoicing";
import type { BusinessProfile, DocumentKind } from "@/lib/invoicing";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DepositModal } from "./DepositModal";
import { AddExpenseModal } from "./AddExpenseModal";

type Open = null | "menu" | "deposit" | "expense";

const ACTIONS = [
  { key: "deposit", label: "Record a deposit", sub: "Money in, split into your buckets", icon: ArrowDownLeft },
  { key: "expense", label: "Add an expense", sub: "Money out, from a bucket", icon: ArrowUpRight },
  { key: "invoice", label: "New invoice", sub: "Bill a client", icon: ReceiptText },
  { key: "quote", label: "New quote", sub: "Price the work first", icon: FilePen },
] as const;

/**
 * The centre button of the mobile tab bar: the things people do most, one tap away
 * from any screen.
 */
export const QuickAdd = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const [creating, setCreating] = useState<DocumentKind | null>(null);

  const refresh = () => queryClient.invalidateQueries();

  const newDocument = async (kind: DocumentKind) => {
    if (!user) return;
    setCreating(kind);
    try {
      const { data: bp } = await supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle();
      const id = await createDraft(kind, user.id, (bp as BusinessProfile | null) ?? null);
      setOpen(null);
      navigate(`/${kind === "invoice" ? "invoices" : "quotes"}/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(null);
    }
  };

  const pick = (key: (typeof ACTIONS)[number]["key"]) => {
    if (key === "deposit" || key === "expense") setOpen(key);
    else newDocument(key);
  };

  return (
    <>
      <div className="flex w-16 flex-shrink-0 items-start justify-center">
        <button
          onClick={() => setOpen("menu")}
          aria-label="Add"
          className="-mt-4 grid size-14 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-md transition active:scale-95"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      </div>

      <Sheet open={open === "menu"} onOpenChange={(v) => setOpen(v ? "menu" : null)}>
        <SheetContent side="bottom" className="rounded-t-3xl [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>Add</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {ACTIONS.map(({ key, label, sub, icon: Icon }) => (
              <button
                key={key}
                onClick={() => pick(key)}
                disabled={creating !== null}
                className="flex flex-col items-start gap-2 rounded-2xl border border-border p-4 text-left transition active:bg-secondary disabled:opacity-60"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{creating === key ? "Opening…" : label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <DepositModal open={open === "deposit"} onClose={() => setOpen(null)} onSaved={refresh} />
      {user && (
        <AddExpenseModal open={open === "expense"} onClose={() => setOpen(null)} onSaved={refresh} userId={user.id} />
      )}
    </>
  );
};
