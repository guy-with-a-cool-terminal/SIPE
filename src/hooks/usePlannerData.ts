import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Bucket, ExpenseTemplate } from "@/integrations/supabase/types";
import { monthlyEquivalent, typicalMonthlyIncome, type TypicalIncome } from "@/lib/planner";

export interface PlannerData {
  income: TypicalIncome;
  bills: ExpenseTemplate[];
  /** Sum of every bill's monthly equivalent. */
  billsMonthly: number;
  split: Record<Bucket, number>;
  /** Live Savings bucket balance. */
  savingsBalance: number;
}

const EMPTY: PlannerData = {
  income: { monthly: 0, basis: "none", monthsUsed: 0, avgPayment: 0 },
  bills: [],
  billsMonthly: 0,
  split: { S: 20, I: 15, P: 50, E: 15 },
  savingsBalance: 0,
};

export const PLANNER_KEY = "planner";

/**
 * The numbers every calculator starts from: typical income, bills, split and
 * savings. One cached query so opening several calculators costs one fetch.
 * Invalidate `["planner"]` after changing bills or the split.
 */
export function usePlannerData() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: [PLANNER_KEY, user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<PlannerData> => {
      const since = new Date();
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      since.setMonth(since.getMonth() - 6);

      const [incRes, billsRes, splitRes, balRes] = await Promise.all([
        supabase.from("transactions")
          .select("amount,occurred_at")
          .eq("user_id", user!.id)
          .eq("type", "income")
          .is("parent_id", null)
          .neq("category", "Transfer")
          .gte("occurred_at", since.toISOString()),
        supabase.from("expense_templates").select("*").eq("user_id", user!.id).order("created_at"),
        supabase.from("allocation_settings")
          .select("savings_pct,invest_pct,pay_pct,expenses_pct")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase.from("bucket_balances").select("bucket,balance").eq("user_id", user!.id).eq("bucket", "S"),
      ]);

      const bills = (billsRes.data || []) as ExpenseTemplate[];
      const s = splitRes.data;
      return {
        income: typicalMonthlyIncome(incRes.data || []),
        bills,
        billsMonthly: bills.reduce((sum, b) => sum + monthlyEquivalent(Number(b.amount), b.every_months), 0),
        split: s
          ? { S: Number(s.savings_pct), I: Number(s.invest_pct), P: Number(s.pay_pct), E: Number(s.expenses_pct) }
          : EMPTY.split,
        savingsBalance: Number(balRes.data?.[0]?.balance ?? 0),
      };
    },
  });
  return { data: q.data ?? EMPTY, loading: q.isLoading };
}
