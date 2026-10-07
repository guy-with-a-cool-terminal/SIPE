import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Announcement } from "@/integrations/supabase/types";
import { Markdown } from "./Markdown";
import { ResponsiveModal } from "./ResponsiveModal";

const SEEN_KEY = "sipe:lastSeenAnnouncement";

const isExternal = (url: string) => /^https?:\/\//i.test(url);

export const WhatsNew = () => {
  const { user } = useAuth();
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .not("published_at", "is", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      let seen: string | null = null;
      try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
      if (data.id !== seen) setAnn(data as Announcement);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const dismiss = () => {
    if (ann) {
      try { localStorage.setItem(SEEN_KEY, ann.id); } catch { /* ignore */ }
    }
    setAnn(null);
  };

  if (!ann) return null;

  return (
    <ResponsiveModal open={!!ann} onClose={dismiss} title={ann.title}>
      <div>
        <div className="flex items-center gap-2 text-primary mb-3">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">What's new</span>
        </div>

        <Markdown md={ann.body_md} />

        <div className="flex flex-wrap items-center gap-3 mt-6">
          {ann.cta_url && (
            isExternal(ann.cta_url) ? (
              <a href={ann.cta_url} target="_blank" rel="noreferrer noopener" onClick={dismiss}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-primary-glow transition">
                {ann.cta_label || "Learn more"}
              </a>
            ) : (
              <Link to={ann.cta_url} onClick={dismiss}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-primary-glow transition">
                {ann.cta_label || "Learn more"}
              </Link>
            )
          )}
          <button onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground transition">
            Dismiss
          </button>
          <Link to="/whats-new" onClick={dismiss} className="text-sm text-primary hover:text-primary/80 transition ml-auto">
            All updates →
          </Link>
        </div>
      </div>
    </ResponsiveModal>
  );
};
