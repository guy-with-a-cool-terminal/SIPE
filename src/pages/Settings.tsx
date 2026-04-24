import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AllocationSettings, Bucket } from "@/integrations/supabase/types";
import { BUCKET_META } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SettingsPage = () => {
  const { user } = useAuth();
  const [s, setS] = useState({ savings_pct: 20, invest_pct: 15, pay_pct: 50, expenses_pct: 15 });
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [setRes, profRes] = await Promise.all([
        supabase.from("allocation_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      if (setRes.data) setS({
        savings_pct: setRes.data.savings_pct,
        invest_pct: setRes.data.invest_pct,
        pay_pct: setRes.data.pay_pct,
        expenses_pct: setRes.data.expenses_pct,
      });
      setName(profRes.data?.full_name || "");
      setLoading(false);
    })();
  }, [user]);

  const total = s.savings_pct + s.invest_pct + s.pay_pct + s.expenses_pct;
  const valid = total === 100;

  const save = async () => {
    if (!valid) return toast.error(`Percentages must sum to 100 (currently ${total})`);
    setSaving(true);
    const [a, b] = await Promise.all([
      supabase.from("allocation_settings").upsert({ user_id: user!.id, ...s, updated_at: new Date().toISOString() }),
      supabase.from("profiles").update({ full_name: name }).eq("id", user!.id),
    ]);
    setSaving(false);
    if (a.error || b.error) return toast.error(a.error?.message || b.error?.message || "Save failed");
    toast.success("Settings saved");
  };

  const webhookUrl = `${SUPABASE_URL}/functions/v1/paystack-webhook?uid=${user?.id}`;
  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const fields: { key: keyof typeof s; bucket: Bucket }[] = [
    { key: "savings_pct", bucket: "S" },
    { key: "invest_pct", bucket: "I" },
    { key: "pay_pct", bucket: "P" },
    { key: "expenses_pct", bucket: "E" },
  ];

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Settings</h1>
      <p className="text-muted-foreground mb-10">Tune your split. Tune your life.</p>

      {/* Profile */}
      <section className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <label className="block">
          <span className="text-sm text-muted-foreground">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
        </label>
        <label className="block mt-4">
          <span className="text-sm text-muted-foreground">Email</span>
          <input value={user?.email || ""} disabled className="mt-1.5 w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 text-muted-foreground" />
        </label>
      </section>

      {/* SIPE split */}
      <section className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">SIPE allocation</h2>
          <span className={`text-sm font-medium ${valid ? "text-primary" : "text-destructive"}`}>{total}% / 100%</span>
        </div>
        <div className="space-y-5">
          {fields.map(({ key, bucket }) => {
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
                  className="w-full accent-primary"
                  style={{ accentColor: `hsl(${meta.color})` }}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Paystack webhook */}
      <section className="glass rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-2">Paystack webhook</h2>
        <p className="text-sm text-muted-foreground mb-4">Add this URL to <span className="text-foreground">Paystack Dashboard → Settings → Webhooks</span> to auto-record incoming payments.</p>
        <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2.5">
          <code className="text-xs text-muted-foreground truncate flex-1">{webhookUrl}</code>
          <button onClick={copyWebhook} className="text-muted-foreground hover:text-foreground transition">
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </button>
        </div>
      </section>

      <button onClick={save} disabled={saving || !valid} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary-glow transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
};
export default SettingsPage;
