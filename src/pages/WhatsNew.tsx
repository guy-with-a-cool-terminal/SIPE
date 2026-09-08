import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { Announcement } from "@/integrations/supabase/types";
import { Markdown } from "@/components/app/Markdown";
import { CardGridSkeleton } from "@/components/app/Skeletons";

const SEEN_KEY = "sipe:lastSeenAnnouncement";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "";

const isExternal = (url: string) => /^https?:\/\//i.test(url);

const WhatsNewPage = () => {
  const { user } = useAuth();
  usePageTitle("What's new");
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .not("published_at", "is", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false });
      const list = (data ?? []) as Announcement[];
      setItems(list);
      setLoading(false);
      if (list[0]) {
        try { localStorage.setItem(SEEN_KEY, list[0].id); } catch { /* ignore */ }
      }
    })();
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-24 md:pb-10">
      <div className="flex items-center gap-2 text-primary mb-1">
        <Sparkles className="size-5" />
        <span className="text-xs font-semibold uppercase tracking-wide">What's new</span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8">Product updates</h1>

      {loading ? (
        <CardGridSkeleton count={3} className="space-y-4" />
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">No updates yet.</div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <article key={a.id} className="glass rounded-2xl p-6">
              <p className="text-xs text-muted-foreground mb-1">{fmtDate(a.published_at)}</p>
              <h2 className="text-lg font-bold mb-3">{a.title}</h2>
              <Markdown md={a.body_md} />
              {a.cta_url && (
                <div className="mt-4">
                  {isExternal(a.cta_url) ? (
                    <a href={a.cta_url} target="_blank" rel="noreferrer noopener"
                      className="text-sm font-semibold text-primary hover:text-primary/80">
                      {a.cta_label || "Learn more"} →
                    </a>
                  ) : (
                    <Link to={a.cta_url} className="text-sm font-semibold text-primary hover:text-primary/80">
                      {a.cta_label || "Learn more"} →
                    </Link>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default WhatsNewPage;
