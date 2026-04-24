import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_META, formatKES, type Bucket, type Transaction } from "@/integrations/supabase/types";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";

interface PaymentLink {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  paystack_url: string | null;
  active: boolean;
  created_at: string;
}

interface TxnWithChildren extends Transaction {
  source: string | null;
  payment_link_id: string | null;
  children?: Transaction[];
}

const LinkDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [parents, setParents] = useState<TxnWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [lRes, txRes] = await Promise.all([
        supabase.from("payment_links").select("*").eq("id", id).maybeSingle(),
        supabase.from("transactions").select("*").eq("payment_link_id", id).order("occurred_at", { ascending: false }),
      ]);
      setLink(lRes.data as PaymentLink | null);
      const all = (txRes.data || []) as TxnWithChildren[];
      const parentRows = all.filter(t => !t.parent_id);
      parentRows.forEach(p => { p.children = all.filter(c => c.parent_id === p.id); });
      setParents(parentRows);
      setLoading(false);
    })();
  }, [id]);

  const total = parents.reduce((s, p) => s + Number(p.amount), 0);

  const copy = () => {
    if (!link?.paystack_url) return;
    navigator.clipboard.writeText(link.paystack_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!link) return <div className="p-10 text-muted-foreground">Link not found.</div>;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <Link to="/links" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-6">
        <ArrowLeft className="size-4" /> All links
      </Link>

      <div className="glass rounded-2xl p-6 md:p-8 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{link.name}</h1>
            {link.description && <p className="text-muted-foreground mt-1">{link.description}</p>}
            <p className="text-sm text-muted-foreground mt-3">Charge amount: <span className="text-foreground font-semibold">{formatKES(Number(link.amount))}</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Collected</p>
            <p className="text-3xl font-bold text-primary">{formatKES(total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{parents.length} payment{parents.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6 bg-input border border-border rounded-xl px-3 py-2.5">
          <code className="text-xs text-muted-foreground truncate flex-1">{link.paystack_url}</code>
          <button onClick={copy} className="text-muted-foreground hover:text-foreground transition">
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </button>
          <a href={link.paystack_url || "#"} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition">
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-4">Payment history</h2>
      {parents.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No payments yet. Share the link above with your client.
        </div>
      ) : (
        <div className="space-y-3">
          {parents.map(p => (
            <div key={p.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.source || p.description || "Payment"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(p.occurred_at).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className="text-xl font-bold text-primary whitespace-nowrap">+{formatKES(Number(p.amount))}</p>
              </div>
              {p.children && p.children.length > 0 && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {p.children.map(c => {
                    const meta = c.bucket ? BUCKET_META[c.bucket as Bucket] : null;
                    if (!meta || !c.bucket) return null;
                    return (
                      <div key={c.id} className="rounded-xl px-3 py-2 border border-border" style={{ backgroundColor: `hsl(${meta.color} / 0.08)` }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: `hsl(${meta.color})` }}>
                          <span className="font-bold">{c.bucket}</span><span>{meta.name}</span>
                        </div>
                        <p className="text-sm font-semibold mt-1">{formatKES(Number(c.amount))}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default LinkDetail;
