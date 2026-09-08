import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { formatKES } from "@/integrations/supabase/types";
import { Plus, Copy, Check, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton } from "@/components/app/Skeletons";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface PaymentLink {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  paystack_slug: string | null;
  paystack_url: string | null;
  active: boolean;
  created_at: string;
}

const Links = () => {
  const { user } = useAuth();
  usePageTitle("Payment links");
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [totals, setTotals] = useState<Record<string, { count: number; sum: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: ls } = await supabase.from("payment_links").select("*").order("created_at", { ascending: false });
    setLinks((ls || []) as PaymentLink[]);
    if (ls && ls.length) {
      const ids = ls.map(l => l.id);
      const { data: txns } = await supabase
        .from("transactions")
        .select("payment_link_id,amount,parent_id")
        .in("payment_link_id", ids)
        .is("parent_id", null);
      const t: Record<string, { count: number; sum: number }> = {};
      (txns || []).forEach(r => {
        const k = r.payment_link_id as string;
        if (!t[k]) t[k] = { count: 0, sum: 0 };
        t[k].count += 1;
        t[k].sum += Number(r.amount);
      });
      setTotals(t);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      description: String(fd.get("description") || ""),
      amount: Number(fd.get("amount")),
    };
    if (!payload.name || !payload.amount) return toast.error("Name and amount are required");
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) return toast.error(body.error || "Failed to create link");
    toast.success("Payment link created");
    setShowNew(false);
    load();
  };

  const copy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
      <PageHeader
        title="Payment links"
        subtitle="Charge clients. Auto-split. Track everything."
        actions={
          <button onClick={() => setShowNew(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-semibold text-sm hover:bg-primary-glow transition flex items-center gap-2">
            <Plus className="size-4" /> New<span className="hidden sm:inline"> link</span>
          </button>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} className="grid md:grid-cols-2 gap-4" />
      ) : links.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Link2 className="size-10 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No payment links yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Create one to charge a client. Every payment auto-splits into your buckets.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {links.map(l => {
            const t = totals[l.id] || { count: 0, sum: 0 };
            return (
              <div key={l.id} className="glass rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/links/${l.id}`} className="text-lg font-semibold hover:text-primary transition truncate block">{l.name}</Link>
                    {l.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{l.description}</p>}
                  </div>
                  <p className="text-xl font-bold whitespace-nowrap">{formatKES(Number(l.amount))}</p>
                </div>
                <div className="flex items-center gap-2 mt-4 bg-input border border-border rounded-xl px-3 py-2">
                  <code className="text-xs text-muted-foreground truncate flex-1">{l.paystack_url}</code>
                  <button onClick={() => copy(l.paystack_url || "", l.id)} className="text-muted-foreground hover:text-foreground transition">
                    {copied === l.id ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                  </button>
                  <a href={l.paystack_url || "#"} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition">
                    <ExternalLink className="size-4" />
                  </a>
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.count} payment{t.count === 1 ? "" : "s"}</span>
                  <span className="font-semibold text-primary">{formatKES(t.sum)} collected</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ResponsiveModal open={showNew} onClose={() => setShowNew(false)} title="New payment link">
        <form onSubmit={create}>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm text-muted-foreground">Name</span>
              <input name="name" required placeholder="e.g. Logo design, Acme Co" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Description (optional)</span>
              <input name="description" className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Amount (KES)</span>
              <input name="amount" type="number" step="0.01" required className="mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary" />
            </label>
          </div>
          <button type="submit" disabled={creating} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary-glow transition disabled:opacity-50">
            {creating ? "Creating…" : "Create link"}
          </button>
        </form>
      </ResponsiveModal>
    </div>
  );
};
export default Links;
