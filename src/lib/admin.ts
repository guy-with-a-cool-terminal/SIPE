// Admin status comes from the server, never the client bundle. The `admin` edge
// function checks the caller against the ADMIN_EMAILS secret; `whoami` just
// reports the answer so the UI can show or hide the /admin entry point.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  subscribed: boolean;
  email_prefs: { weekly_review: boolean; tips: boolean; announcements: boolean; goal_updates: boolean } | null;
}

/** POST an action to the `admin` edge function. Throws on non-2xx. */
export async function adminCall<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

async function fetchIsAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  try {
    const { admin } = await adminCall<{ admin: boolean }>({ action: "whoami" });
    return !!admin;
  } catch {
    return false;
  }
}

/** Cached for the session; returns `undefined` while loading, then a boolean. */
export function useAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: fetchIsAdmin,
    staleTime: Infinity,
    retry: false,
  });
  return { isAdmin: data ?? false, loading: isLoading };
}

/** The full user list for admin views. Cached 60s. */
export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await adminCall<{ users: AdminUser[] }>({ action: "users" })).users,
    staleTime: 60_000,
    enabled,
  });
}
