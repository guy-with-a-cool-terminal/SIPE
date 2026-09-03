// Pure helpers for the Accounts feature (no React, no Supabase).

import type { Account, AccountKind } from "@/integrations/supabase/types";

export interface KindMeta {
  label: string;
  /** lucide-react icon name */
  icon: string;
  order: number;
}

export const KIND_META: Record<AccountKind, KindMeta> = {
  platform: { label: "Platform",     icon: "Server",           order: 0 },
  bank:     { label: "Bank",         icon: "Landmark",         order: 1 },
  mpesa:    { label: "Mobile money", icon: "Smartphone",       order: 2 },
  cash:     { label: "Cash",         icon: "Wallet",           order: 3 },
  other:    { label: "Other",        icon: "CircleDollarSign", order: 4 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 14;

/**
 * Signed difference between the money located in accounts and the money in the
 * S/I/P/E buckets. Positive → accounts hold more than the buckets account for.
 */
export function reconcileDiff(accountsTotal: number, bucketsTotal: number): number {
  return Number((accountsTotal - bucketsTotal).toFixed(2));
}

type StaleAccount = Pick<Account, "kind" | "provider_slug" | "last_synced_at">;

/**
 * A platform/bank account with no configured sync and no recent movement is
 * "stale" — the displayed balance is probably drifting from reality.
 */
export function isStale(
  account: StaleAccount,
  lastTxnAt: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (account.kind !== "platform" && account.kind !== "bank") return false;
  if (account.provider_slug) return false; // sync configured — kept fresh elsewhere

  const cutoff = now.getTime() - STALE_DAYS * DAY_MS;

  const synced = account.last_synced_at ? new Date(account.last_synced_at).getTime() : null;
  if (synced !== null && synced >= cutoff) return false;

  const lastTxn = lastTxnAt ? new Date(lastTxnAt).getTime() : null;
  if (lastTxn !== null && lastTxn >= cutoff) return false;

  return true;
}

export interface KindGroup<T> {
  kind: AccountKind;
  meta: KindMeta;
  accounts: T[];
}

/** Group accounts by kind, ordered by `KIND_META.order`, empty kinds omitted. */
export function groupByKind<T extends { kind: AccountKind }>(accounts: T[]): KindGroup<T>[] {
  const map = new Map<AccountKind, T[]>();
  for (const a of accounts) {
    const list = map.get(a.kind) ?? [];
    list.push(a);
    map.set(a.kind, list);
  }
  return Array.from(map.entries())
    .map(([kind, list]) => ({ kind, meta: KIND_META[kind], accounts: list }))
    .sort((a, b) => a.meta.order - b.meta.order);
}
