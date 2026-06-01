import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BUCKET_META, formatKES, type AllocationSettings, type Bucket, type ExpenseTemplate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2, Plus, Trash2, X } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ALL_BUCKETS: Bucket[] = ["S", "I", "P", "E"];

interface PaymentLink {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  paystack_url: string | null;
  active: boolean;
  created_at: string;
}

type SettingsTab = "profile" | "allocation" | "bills" | "links" | "integrations";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "profile",      label: "Profile" },
  { key: "allocation",   label: "Allocation" },
  { key: "bills",        label: "Bills" },
  { key: "links",        label: "Payment links" },
  { key: "integrations", label: "Integrations" },
];

const SettingsPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [s, setS] = useState({ savings_pct: 20, invest_pct: 15, pay_pct: 50, expenses_pct: 15 });
  const [limits, setLimits] = useState({ savings_limit: "", invest_limit: "", pay_limit: "", expenses_limit: "" });
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [showAddBill, setShowAddBill] = useState(false);
  const [billName, setBillName] = useState("");
  const [billBucket, setBillBucket] = useState<Bucket>("E");
  const [billAmount, setBillAmount] = useState("");
  const [billCategory, setBillCategory] = useState("");
  const [savingBill, setSavingBill] = useState(false);

  // Payment links state
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [linkTotals, setLinkTotals] = useState<Record<string, { count: number; sum: number }>>({});
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [showNewLink, setShowNewLink] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkDesc, setNewLinkDesc] = useState("");
  const [newLinkAmount, setNewLinkAmount] = useState("");

  const loadLinks = async () => {
    setLoadingLinks(true);
    const { data: ls } = await supabase.from("payment_links").select("*").order("created_at", { ascending: false });
    const list = (ls || []) as PaymentLink[];
    setLinks(list);
    if (list.length) {
      const ids = list.map(l => l.id);
      const { data: txns } = await supabase
        .from("transactions")
        .select("payment_link_id,amount,parent_id")
        .in("payment_link_id", ids)
        .is("parent_id", null);
      const t: Record<string, { count: number; sum: number }> = {};
      (txns || []).forEach((r: { payment_link_id: string; amount: number }) => {
        if (!t[r.payment_link_id]) t[r.payment_link_id] = { count: 0, sum: 0 };
        t[r.payment_link_id].count += 1;
        t[r.payment_link_id].sum += Number(r.amount);
      });
      setLinkTotals(t);
    }
    setLinksLoaded(true);
    setLoadingLinks(false);
  };

  const createLink = async () => {
    if (!newLinkName.trim() || !newLinkAmount) return toast.error("Name and amount are required");
    setCreatingLink(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ name: newLinkName.trim(), description: newLinkDesc.trim(), amount: Number(newLinkAmount) }),
    });
    const body = await res.json();
    setCreatingLink(false);
    if (!res.ok) return toast.error(body.error || "Failed to create link");
    toast.success("Payment link created");
    setShowNewLink(false);
    setNewLinkName(""); setNewLinkDesc(""); setNewLinkAmount("");
    loadLinks();
  };

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 1500);
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from("expense_templates").select("*").eq("user_id", user!.id).order("created_at");
    setTemplates(data || []);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [setRes, profRes] = await Promise.all([
        supabase.from("allocation_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      if (setRes.data) {
        const d = setRes.data as AllocationSettings;
        setS({ savings_pct: d.savings_pct, invest_pct: d.invest_pct, pay_pct: d.pay_pct, expenses_pct: d.expenses_pct });
        setLimits({
          savings_limit:  d.savings_limit  != null ? String(d.savings_limit)  : "",
          invest_limit:   d.invest_limit   != null ? String(d.invest_limit)   : "",
          pay_limit:      d.pay_limit      != null ? String(d.pay_limit)      : "",
          expenses_limit: d.expenses_limit != null ? String(d.expenses_limit) : "",
        });
      }
      setName(profRes.data?.full_name || "");
      setLoading(false);
    })();
    loadTemplates();
  }, [user]);

  useEffect(() => {
    if (activeTab === "links" && !linksLoaded && user) loadLinks();
  }, [activeTab, user]);

  const total = s.savings_pct + s.invest_pct + s.pay_pct + s.expenses_pct;
  const valid = total === 100;

  const save = async () => {
    if (!valid) return toast.error(`Percentages must sum to 100 (currently ${total})`);
    setSaving(true);
    const [a, b] = await Promise.all([
      supabase.from("allocation_settings").upsert({
        user_id: user!.id,
        ...s,
        savings_limit:  limits.savings_limit  !== "" ? Number(limits.savings_limit)  : null,
        invest_limit:   limits.invest_limit   !== "" ? Number(limits.invest_limit)   : null,
        pay_limit:      limits.pay_limit      !== "" ? Number(limits.pay_limit)      : null,
        expenses_limit: limits.expenses_limit !== "" ? Number(limits.expenses_limit) : null,
        updated_at: new Date().toISOString(),
      }),
      supabase.from("profiles").update({ full_name: name }).eq("id", user!.id),
    ]);
    setSaving(false);
    if (a.error || b.error) return toast.error(a.error?.message || b.error?.message || "Save failed");
    toast.success("Settings saved");
  };

  const addBill = async () => {
    if (!billName.trim()) return toast.error("Enter a bill name");
    const amt = Number(billAmount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setSavingBill(true);
    const { error } = await supabase.from("expense_templates").insert({
      user_id: user!.id,
      name: billName.trim(),
      bucket: billBucket,
      amount: amt,
      category: billCategory.trim() || null,
    });
    setSavingBill(false);
    if (error) return toast.error(error.message);
    setBillName(""); setBillBucket("E"); setBillAmount(""); setBillCategory("");
    setShowAddBill(false);
    loadTemplates();
    toast.success("Bill saved");
  };

  const deleteBill = async (id: string) => {
    const { error } = await supabase.from("expense_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const webhookUrl = `${SUPABASE_URL}/functions/v1/paystack-webhook?uid=${user?.id}`;
  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const allocFields: { key: keyof typeof s; bucket: Bucket }[] = [
    { key: "savings_pct",  bucket: "S" },
    { key: "invest_pct",   bucket: "I" },
    { key: "pay_pct",      bucket: "P" },
    { key: "expenses_pct", bucket: "E" },
  ];

  const limitFields: { key: keyof typeof limits; bucket: Bucket }[] = [
    { key: "savings_limit",  bucket: "S" },
    { key: "invest_limit",   bucket: "I" },
    { key: "pay_limit",      bucket: "P" },
    { key: "expenses_limit", bucket: "E" },
  ];

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Tune your split. Tune your life.</p>
      </div>

      {/* Mobile: horizontal pill tabs */}
      <div className="md:hidden flex gap-1 p-1 bg-secondary/40 rounded-xl mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-10">
        {/* Desktop: vertical sidebar tabs */}
        <nav className="hidden md:flex flex-col w-40 gap-0.5 flex-shrink-0 pt-0.5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2.5 rounded-lg text-sm text-left transition font-medium ${
                activeTab === t.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* ── Profile ── */}
          {activeTab === "profile" && (
            <>
              <section className="glass rounded-2xl p-6">
                <h2 className="text-base font-semibold mb-4">Profile</h2>
                <label className="block">
                  <span className="text-sm text-muted-foreground">Full name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
                </label>
                <label className="block mt-4">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <input value={user?.email || ""} disabled className="mt-1.5 w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 text-muted-foreground" />
                </label>
              </section>
              <button onClick={save} disabled={saving} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary-glow transition disabled:opacity-50">
                {saving ? "Saving…" : "Save profile"}
              </button>
            </>
          )}

          {/* ── Allocation ── */}
          {activeTab === "allocation" && (
            <>
              <section className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-semibold">SIPE split</h2>
                  <span className={`text-sm font-medium ${valid ? "text-primary" : "text-destructive"}`}>{total}% / 100%</span>
                </div>
                <div className="space-y-5">
                  {allocFields.map(({ key, bucket }) => {
                    const meta = BUCKET_META[bucket];
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg grid place-items-center font-bold text-sm" style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}>{bucket}</div>
                            <span className="text-sm font-medium">{meta.name}</span>
                          </div>
                          <input
                            type="number" min={0} max={100}
                            value={s[key]}
                            onChange={(e) => setS({ ...s, [key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                            className="w-20 text-right bg-input border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                          />
                        </div>
                        <input
                          type="range" min={0} max={100} value={s[key]}
                          onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
                          className="w-full"
                          style={{ accentColor: `hsl(${meta.color})` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="glass rounded-2xl p-6">
                <h2 className="text-base font-semibold mb-1">Monthly spending limits</h2>
                <p className="text-sm text-muted-foreground mb-5">Cap how much you spend from each bucket per month. Leave blank for no limit.</p>
                <div className="space-y-4">
                  {limitFields.map(({ key, bucket }) => {
                    const meta = BUCKET_META[bucket];
                    return (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg grid place-items-center font-bold text-sm" style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}>{bucket}</div>
                          <span className="text-sm font-medium">{meta.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">KES</span>
                          <input
                            type="number" min={0} placeholder="no limit"
                            value={limits[key]}
                            onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
                            className="w-32 text-right bg-input border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <button onClick={save} disabled={saving || !valid} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary-glow transition disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "Saving…" : "Save allocation"}
              </button>
            </>
          )}

          {/* ── Bills ── */}
          {activeTab === "bills" && (
            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold">Fixed bills &amp; recurring expenses</h2>
                <button
                  onClick={() => setShowAddBill(v => !v)}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  {showAddBill ? <><X className="size-4" /> Cancel</> : <><Plus className="size-4" /> Add bill</>}
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-5">Save rent, wifi, subscriptions etc. for quick-add when logging expenses.</p>

              {showAddBill && (
                <div className="bg-secondary/30 rounded-xl p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block col-span-2">
                      <span className="text-xs text-muted-foreground">Bill name</span>
                      <input
                        value={billName} onChange={(e) => setBillName(e.target.value)}
                        placeholder="e.g. Monthly rent"
                        className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">Bucket</span>
                      <select
                        value={billBucket} onChange={(e) => setBillBucket(e.target.value as Bucket)}
                        className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                      >
                        {ALL_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_META[b].name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">Amount (KES)</span>
                      <input
                        type="number" min={0} step="0.01"
                        value={billAmount} onChange={(e) => setBillAmount(e.target.value)}
                        placeholder="0.00"
                        className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block col-span-2">
                      <span className="text-xs text-muted-foreground">Category (optional)</span>
                      <input
                        value={billCategory} onChange={(e) => setBillCategory(e.target.value)}
                        placeholder="e.g. Housing, Utilities, Subscriptions"
                        className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                  <button
                    onClick={addBill} disabled={savingBill}
                    className="w-full bg-primary text-primary-foreground font-semibold py-2 rounded-lg text-sm hover:bg-primary-glow transition disabled:opacity-50"
                  >
                    {savingBill ? "Saving…" : "Save bill"}
                  </button>
                </div>
              )}

              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fixed bills saved yet. Add your first one above.</p>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {templates.map(t => {
                    const meta = BUCKET_META[t.bucket];
                    return (
                      <div key={t.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-7 rounded-md grid place-items-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: `hsl(${meta.color} / 0.15)`, color: `hsl(${meta.color})` }}>{t.bucket}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          <span className="text-sm font-semibold tabular-nums">{formatKES(t.amount)}</span>
                          <button onClick={() => deleteBill(t.id)} className="text-muted-foreground hover:text-destructive transition">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {templates.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Total committed: {formatKES(templates.reduce((s, t) => s + Number(t.amount), 0))} / month
                </p>
              )}
            </section>
          )}

          {/* ── Payment Links ── */}
          {activeTab === "links" && (
            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold">Payment links</h2>
                <button
                  onClick={() => setShowNewLink(v => !v)}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  {showNewLink ? <><X className="size-4" /> Cancel</> : <><Plus className="size-4" /> New link</>}
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-5">Charge clients. Every payment auto-splits into your buckets.</p>

              {/* Create form */}
              {showNewLink && (
                <div className="bg-secondary/30 rounded-xl p-4 mb-4 space-y-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <input value={newLinkName} onChange={e => setNewLinkName(e.target.value)} placeholder="e.g. Logo design — Acme Co"
                      className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Description (optional)</span>
                    <input value={newLinkDesc} onChange={e => setNewLinkDesc(e.target.value)}
                      className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Amount (KES)</span>
                    <input type="number" step="0.01" value={newLinkAmount} onChange={e => setNewLinkAmount(e.target.value)} placeholder="0.00"
                      className="mt-1 w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </label>
                  <button onClick={createLink} disabled={creatingLink}
                    className="w-full bg-primary text-primary-foreground font-semibold py-2 rounded-lg text-sm hover:bg-primary-glow transition disabled:opacity-50">
                    {creatingLink ? "Creating…" : "Create link"}
                  </button>
                </div>
              )}

              {/* Link list */}
              {loadingLinks ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : links.length === 0 ? (
                <div className="text-center py-8">
                  <Link2 className="size-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No payment links yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {links.map(l => {
                    const t = linkTotals[l.id] || { count: 0, sum: 0 };
                    return (
                      <div key={l.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{l.name}</p>
                            {l.description && <p className="text-xs text-muted-foreground truncate">{l.description}</p>}
                          </div>
                          <span className="text-sm font-semibold tabular-nums flex-shrink-0">{formatKES(Number(l.amount))}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-xs text-muted-foreground truncate flex-1">{l.paystack_url}</code>
                          <button onClick={() => copyLink(l.paystack_url || "", l.id)} className="text-muted-foreground hover:text-foreground transition flex-shrink-0">
                            {copiedLink === l.id ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
                          </button>
                          <a href={l.paystack_url || "#"} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition flex-shrink-0">
                            <ExternalLink className="size-3.5" />
                          </a>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {t.count} payment{t.count !== 1 ? "s" : ""} · <span className="text-primary">{formatKES(t.sum)} collected</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── Integrations ── */}
          {activeTab === "integrations" && (
            <section className="glass rounded-2xl p-6">
              <h2 className="text-base font-semibold mb-2">Paystack webhook</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Add this URL to <span className="text-foreground">Paystack Dashboard → Settings → Webhooks</span> to auto-record incoming payments.
              </p>
              <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2.5">
                <code className="text-xs text-muted-foreground truncate flex-1">{webhookUrl}</code>
                <button onClick={copyWebhook} className="text-muted-foreground hover:text-foreground transition flex-shrink-0">
                  {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                </button>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
