import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Send, Users, User as UserIcon } from "lucide-react";
import { EMAIL_TEMPLATES, templateById } from "@/lib/emailTemplates";
import { adminCall } from "@/lib/admin";
import { Markdown } from "@/components/app/Markdown";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { UserPicker } from "@/components/app/UserPicker";
import type { Announcement } from "@/integrations/supabase/types";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

export const AdminEmail = () => {
  const [templateId, setTemplateId] = useState("blank");
  const [subject, setSubject] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<"all" | "user">("all");
  const [email, setEmail] = useState("");
  const [postToFeed, setPostToFeed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [feed, setFeed] = useState<Announcement[]>([]);

  const loadFeed = () => adminCall<{ announcements: Announcement[] }>({ action: "feed" })
    .then((r) => setFeed(r.announcements ?? []))
    .catch((e) => toast.error((e as Error).message));

  useEffect(() => { loadFeed(); }, []);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templateById(id);
    if (!t) return;
    setSubject(t.subject);
    setBodyMd(t.body_md);
    setCtaLabel(t.cta_label ?? "");
    setCtaUrl(t.cta_url ?? "");
    setAudience(t.audience);
    setPostToFeed(t.postToFeed);
  };

  const recipientLabel = audience === "user"
    ? (email.trim() || "one user")
    : "every product-news subscriber";

  const askSend = () => {
    if (!subject.trim() || !bodyMd.trim()) return toast.error("Subject and body are required");
    if (audience === "user" && !email.trim()) return toast.error("Enter the recipient's email");
    setConfirmOpen(true);
  };

  const send = async () => {
    setConfirmOpen(false);
    setSending(true);
    try {
      const r = await adminCall<{ sent: number; skipped: number; failed: number }>({
        action: "send",
        subject: subject.trim(),
        body_md: bodyMd.trim(),
        cta_label: ctaLabel.trim() || undefined,
        cta_url: ctaUrl.trim() || undefined,
        audience,
        email: audience === "user" ? email.trim() : undefined,
        post_to_feed: postToFeed && audience === "all",
      });
      toast.success(`Sent ${r.sent} · skipped ${r.skipped}${r.failed ? ` · failed ${r.failed}` : ""}`);
      loadFeed();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const field = "mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-5">
          <Megaphone className="size-4" /> Compose email
        </h2>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Template</span>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={field}>
              {EMAIL_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>

          <div>
            <span className="text-sm text-muted-foreground">Recipients</span>
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={() => setAudience("all")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition ${audience === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <Users className="size-4" /> All subscribers
              </button>
              <button type="button" onClick={() => setAudience("user")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition ${audience === "user" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <UserIcon className="size-4" /> One user
              </button>
            </div>
            {audience === "user" && (
              <UserPicker value={email} onChange={setEmail} />
            )}
            {audience === "all" && (
              <p className="text-xs text-muted-foreground mt-1.5">Goes to everyone with "Product news" on. Opted-out users are skipped.</p>
            )}
          </div>

          <label className="block">
            <span className="text-sm text-muted-foreground">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
          </label>

          <label className="block">
            <span className="text-sm text-muted-foreground">Body (Markdown)</span>
            <textarea value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} rows={8} className={`${field} font-mono text-sm`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Button label</span>
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={field} placeholder="Optional" />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Button URL</span>
              <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} className={field} placeholder="https://…" />
            </label>
          </div>

          {audience === "all" && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setPostToFeed((v) => !v)} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${postToFeed ? "bg-primary" : "bg-secondary"}`}>
                <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${postToFeed ? "translate-x-5" : ""}`} />
              </div>
              <span className="text-sm text-muted-foreground">Also publish to the What's New feed and add an in-app notification</span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={askSend} disabled={sending}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-xl hover:bg-primary-glow transition disabled:opacity-50 text-sm">
            <Send className="size-4" /> {sending ? "Sending…" : "Send"}
          </button>
          <button onClick={() => setPreview((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground transition">
            {preview ? "Hide preview" : "Preview"}
          </button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Send this email?"
          description={
            <>
              "{subject || "(no subject)"}" goes to <strong>{recipientLabel}</strong>.
              {postToFeed && audience === "all" && " It's also published to the What's New feed with an in-app notification."}
              {" This can't be unsent."}
            </>
          }
          confirmLabel="Send"
          onConfirm={send}
        />

        {preview && (
          <div className="mt-4 border border-border rounded-xl p-5 bg-background/50">
            <p className="text-xs text-muted-foreground mb-2">Subject: <span className="text-foreground">{subject || "(none)"}</span></p>
            <Markdown md={bodyMd || "_(empty body)_"} />
            {ctaUrl && (
              <p className="mt-3">
                <span className="inline-block bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-full">
                  {ctaLabel || "Learn more"}
                </span>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-base font-semibold mb-4">What's New feed</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {feed.map((a) => (
              <li key={a.id} className="py-2.5">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {a.published_at ? `Published ${fmt(a.published_at)}` : "Draft"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
