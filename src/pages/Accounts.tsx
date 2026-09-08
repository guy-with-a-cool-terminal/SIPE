import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  formatKES,
  type Account,
  type AccountBalance,
  type AccountTransfer,
} from "@/integrations/supabase/types";
import { groupByKind, isStale, reconcileDiff } from "@/lib/accounts";
import {
  ArrowRight, Pencil, Plus, Scale, Server, Landmark, Smartphone, Wallet,
  CircleDollarSign, Archive, ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton } from "@/components/app/Skeletons";
import { AccountModal } from "@/components/app/AccountModal";
import { AccountTransferModal } from "@/components/app/AccountTransferModal";
import { AdjustBalanceModal } from "@/components/app/AdjustBalanceModal";

const ICONS: Record<string, typeof Server> = {
  Server, Landmark, Smartphone, Wallet, CircleDollarSign,
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

const Accounts = () => {
  const { user } = useAuth();
  usePageTitle("Accounts");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({});
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [bucketsTotal, setBucketsTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);

  const [accountModal, setAccountModal] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjust, setAdjust] = useState<{ open: boolean; accountId?: string }>({ open: false });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [acctRes, balRes, xferRes, txRes, bktRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("account_balances").select("*").eq("user_id", user.id),
        supabase.from("account_transfers").select("*").eq("user_id", user.id).order("occurred_at", { ascending: false }).limit(15),
        supabase.from("transactions").select("account_id,occurred_at").eq("user_id", user.id).not("account_id", "is", null).order("occurred_at", { ascending: false }).limit(1000),
        supabase.from("bucket_balances").select("balance").eq("user_id", user.id),
      ]);

      if (acctRes.error) toast.error(acctRes.error.message);
      setAccounts(acctRes.data || []);

      const bmap: Record<string, AccountBalance> = {};
      (balRes.data || []).forEach((b: AccountBalance) => { bmap[b.account_id] = b; });
      setBalances(bmap);

      const xfers: AccountTransfer[] = xferRes.data || [];
      setTransfers(xfers);

      const act: Record<string, string> = {};
      (txRes.data || []).forEach((r: { account_id: string; occurred_at: string }) => {
        if (!act[r.account_id] || r.occurred_at > act[r.account_id]) act[r.account_id] = r.occurred_at;
      });
      xfers.forEach((x) => {
        for (const id of [x.from_account_id, x.to_account_id]) {
          if (!act[id] || x.occurred_at > act[id]) act[id] = x.occurred_at;
        }
      });
      setLastActivity(act);

      setBucketsTotal((bktRes.data || []).reduce((s: number, r: { balance: number }) => s + Number(r.balance), 0));
      setLoading(false);
    })();
  }, [user, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const archived = useMemo(() => accounts.filter((a) => a.archived), [accounts]);

  const balanceOf = (a: Account) =>
    balances[a.id] ? Number(balances[a.id].balance) : Number(a.opening_balance);

  const balanceNumberMap = useMemo(() => {
    const m: Record<string, number> = {};
    accounts.forEach((a) => { m[a.id] = balanceOf(a); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, balances]);

  const totalCash = active.reduce((s, a) => s + balanceOf(a), 0);
  const diff = reconcileDiff(totalCash, bucketsTotal);
  const unreconciled = Math.abs(diff) > 1;

  const groups = useMemo(() => groupByKind(active), [active]);

  const openAdjust = (accountId?: string) => setAdjust({ open: true, accountId });

  const archiveToggle = async (a: Account) => {
    const { error } = await supabase.from("accounts").update({ archived: !a.archived }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(a.archived ? "Account restored" : "Account archived");
    reload();
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title="Accounts"
        subtitle="Where your money actually sits: platforms, banks, M-Pesa and cash."
        actions={
          <>
            {active.length >= 2 && (
              <button
                onClick={() => setTransferOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-border hover:bg-secondary transition"
              >
                <ArrowRight className="size-4" /> <span className="hidden sm:inline">Record transfer</span><span className="sm:hidden">Transfer</span>
              </button>
            )}
            <button
              onClick={() => setAccountModal({ open: true, account: null })}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition text-sm"
            >
              <Plus className="size-4" /> New<span className="hidden sm:inline"> account</span>
            </button>
          </>
        }
      />

      {/* Header: total cash + reconciliation chip */}
      {!loading && active.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total cash</p>
            <p className={`text-2xl font-bold mt-1 ${totalCash < 0 ? "text-destructive" : ""}`}>{formatKES(totalCash)}</p>
            <p className="text-xs text-muted-foreground mt-1">{active.length} account{active.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Reconciliation</p>
            <div className="flex items-center gap-2 mt-1 text-sm flex-wrap">
              <span className="tabular-nums">Accounts {formatKES(totalCash)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums">Buckets {formatKES(bucketsTotal)}</span>
              <span className="text-muted-foreground">·</span>
              <span className={`tabular-nums font-semibold ${unreconciled ? "text-destructive" : "text-primary"}`}>
                Δ {diff > 0 ? "+" : diff < 0 ? "−" : ""}{formatKES(Math.abs(diff))}
              </span>
            </div>
            {unreconciled && (
              <button onClick={() => openAdjust()} className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium">
                <Scale className="size-3.5" /> Reconcile
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <CardGridSkeleton count={6} className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3" />
      ) : active.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
            <Wallet className="size-6" />
          </div>
          <p className="font-medium">No accounts yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Add the places your money lives so deposits and expenses can be tagged to a real location.
          </p>
          <button
            onClick={() => setAccountModal({ open: true, account: null })}
            className="mt-4 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold hover:bg-primary-glow transition text-sm"
          >
            <Plus className="size-4" /> New account
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ kind, meta, accounts: list }) => {
            const Icon = ICONS[meta.icon] || CircleDollarSign;
            return (
              <div key={kind}>
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                  <Icon className="size-4" /> {meta.label}
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((a) => {
                    const stale = isStale(a, lastActivity[a.id] ?? null);
                    return (
                      <div key={a.id} className="glass rounded-xl p-4 relative overflow-hidden">
                        {a.color && <span className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: a.color }} />}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate">{a.name}</span>
                              {a.is_default && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Default</span>
                              )}
                              {stale && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: "hsl(var(--warning) / 0.15)", color: "hsl(var(--warning))" }}
                                >
                                  Stale
                                </span>
                              )}
                            </div>
                            {a.institution && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.institution}</p>}
                          </div>
                        </div>

                        <p className={`text-xl font-bold mt-2 tabular-nums ${balanceOf(a) < 0 ? "text-destructive" : ""}`}>
                          {formatKES(balanceOf(a))}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {lastActivity[a.id] ? `Last activity ${fmtDate(lastActivity[a.id])}` : "No activity yet"}
                        </p>

                        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/60">
                          <button onClick={() => setAccountModal({ open: true, account: a })} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition" title="Edit">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => openAdjust(a.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition" title="Adjust balance">
                            <Scale className="size-3.5" />
                          </button>
                          <button onClick={() => archiveToggle(a)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition ml-auto" title="Archive">
                            <Archive className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Recent transfers */}
          {transfers.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-muted-foreground mb-3">Recent transfers</div>
              <div className="glass rounded-xl divide-y divide-border/60">
                {transfers.map((x) => {
                  const fromA = accounts.find((a) => a.id === x.from_account_id);
                  const toA = accounts.find((a) => a.id === x.to_account_id);
                  return (
                    <div key={x.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{fromA?.name ?? "—"}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{toA?.name ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {Number(x.fee) > 0 && <span className="text-xs text-muted-foreground">fee {formatKES(Number(x.fee))}</span>}
                        <span className="tabular-nums font-medium">{formatKES(Number(x.amount))}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(x.occurred_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Archived */}
      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground transition">
            {showArchived ? "Hide" : "Show"} {archived.length} archived account{archived.length !== 1 ? "s" : ""}
          </button>
          {showArchived && (
            <div className="mt-3 space-y-2">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-border opacity-60">
                  <span className="text-sm flex-1 truncate">{a.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatKES(balanceOf(a))}</span>
                  <button onClick={() => archiveToggle(a)} className="p-1 text-muted-foreground hover:text-foreground transition" title="Restore">
                    <ArchiveRestore className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AccountModal
        open={accountModal.open}
        account={accountModal.account}
        userId={user?.id ?? ""}
        onClose={() => setAccountModal({ open: false, account: null })}
        onSaved={reload}
      />
      <AccountTransferModal
        open={transferOpen}
        accounts={active}
        userId={user?.id ?? ""}
        onClose={() => setTransferOpen(false)}
        onSaved={reload}
      />
      <AdjustBalanceModal
        open={adjust.open}
        accounts={active}
        balances={balanceNumberMap}
        initialAccountId={adjust.accountId}
        userId={user?.id ?? ""}
        onClose={() => setAdjust({ open: false })}
        onSaved={reload}
      />
    </div>
  );
};

export default Accounts;
