import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "./useInvoicing";
import {
  attentionItems, computeClientStats, concentration,
  type PriorityDoc, type PriorityPayment,
} from "@/lib/clientPriority";

const DOC_FIELDS =
  "id,kind,status,number,client_id,issue_date,due_date,total,amount_paid,paid_at,source_quote_id,counts_as_income,public_token,title";

/** Clients plus everything the priority view derives from their quotes, invoices and payments. */
export function useClientPriority() {
  const { user } = useAuth();
  const clientsQuery = useClients();
  const docsQuery = useQuery({
    queryKey: ["client-priority", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [docs, payments] = await Promise.all([
        supabase.from("documents").select(DOC_FIELDS).eq("user_id", user!.id).neq("status", "draft"),
        supabase.from("document_payments").select("document_id,amount,paid_at").eq("user_id", user!.id),
      ]);
      if (docs.error) throw docs.error;
      if (payments.error) throw payments.error;
      return { docs: (docs.data || []) as PriorityDoc[], payments: (payments.data || []) as PriorityPayment[] };
    },
  });

  const clients = clientsQuery.data;
  const data = docsQuery.data;
  const derived = useMemo(() => {
    if (!clients || !data) return null;
    const stats = computeClientStats(clients, data.docs, data.payments);
    return {
      stats,
      attention: attentionItems(clients, data.docs, stats),
      concentrated: concentration(stats),
      docs: data.docs,
    };
  }, [clients, data]);

  return {
    clients: clients ?? [],
    ...derived,
    isLoading: clientsQuery.isLoading || docsQuery.isLoading,
    error: clientsQuery.error ?? docsQuery.error,
  };
}
