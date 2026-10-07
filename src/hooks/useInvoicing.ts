import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  draftDefaults,
  type BusinessProfile, type Client, type DocumentKind, type SalesDocument,
} from "@/lib/invoicing";

/** The caller's business profile, or null until they save Settings › Business once. */
export function useBusinessProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data as BusinessProfile | null) ?? null;
    },
  });
}

export function useClients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["clients", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return (data || []) as Client[];
    },
  });
}

export type DocumentRow = SalesDocument & { clients: Pick<Client, "name" | "company"> | null };

export function useDocuments(kind: DocumentKind) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["documents", kind, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents").select("*, clients(name, company)")
        .eq("user_id", user!.id).eq("kind", kind)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DocumentRow[];
    },
  });
}

/** Insert a draft prefilled from Settings › Business and return its id. */
export async function createDraft(
  kind: DocumentKind,
  userId: string,
  bp: BusinessProfile | null,
  overrides: Partial<SalesDocument> = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .insert({ user_id: userId, ...draftDefaults(kind, bp), ...overrides })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Client name as it should read in lists: company first, then contact. */
export const clientLabel = (c: Pick<Client, "name" | "company"> | null | undefined) =>
  c ? (c.company?.trim() || c.name) : "No client";
