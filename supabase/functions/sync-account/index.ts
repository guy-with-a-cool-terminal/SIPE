// sync-account — STUB ONLY (Wave 1 foundation).
//
// The real ops/costs API integrations are intentionally NOT built yet. This
// function establishes the contract a future provider adapter must satisfy and
// returns 501 for every provider until one is registered.
//
// ---------------------------------------------------------------------------
// SyncAdapter contract
// ---------------------------------------------------------------------------
//   interface Movement {
//     amount: number;          // signed, KES
//     occurred_at: string;     // ISO timestamp
//     ref: string;             // provider-side id (idempotency key)
//     description?: string;
//   }
//
//   interface SyncAdapter {
//     // Current spendable/withdrawable balance held on the platform.
//     fetchBalance(cfg: Record<string, unknown>): Promise<{ balance: number; as_of: string }>;
//     // Optional: incremental ledger since a timestamp, for reconciliation.
//     fetchMovements?(cfg: Record<string, unknown>, since: string): Promise<Movement[]>;
//   }
//
// A provider is matched by `accounts.provider_slug`; its credentials/endpoint
// live in `accounts.sync_config` (jsonb). Register real adapters in ADAPTERS.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Movement {
  amount: number;
  occurred_at: string;
  ref: string;
  description?: string;
}

interface SyncAdapter {
  fetchBalance(cfg: Record<string, unknown>): Promise<{ balance: number; as_of: string }>;
  fetchMovements?(cfg: Record<string, unknown>, since: string): Promise<Movement[]>;
}

// No real provider adapters yet — see Wave "ops/costs integration" in the backlog.
const ADAPTERS: Record<string, SyncAdapter> = {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const accountId = (body?.account_id ?? "").toString().trim();
    if (!accountId) return json({ error: "account_id required" }, 400);

    // RLS restricts this to the caller's own accounts.
    const { data: account, error: acctErr } = await userClient
      .from("accounts").select("id, provider_slug").eq("id", accountId).maybeSingle();
    if (acctErr || !account) return json({ error: "Account not found" }, 404);

    const providerSlug: string | null = account.provider_slug ?? null;
    const adapter = providerSlug ? ADAPTERS[providerSlug] : undefined;

    if (!adapter) {
      return json({ error: "No sync adapter configured for this provider", provider_slug: providerSlug }, 501);
    }

    // Unreachable until a real adapter is registered.
    return json({ error: "No sync adapter configured for this provider", provider_slug: providerSlug }, 501);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
