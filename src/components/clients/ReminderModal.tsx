import { useEffect, useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/app/ResponsiveModal";
import { field } from "@/lib/forms";
import { issuerDisplayName, type Client } from "@/lib/invoicing";
import { clientName, reminderText, whatsappLink, type AttentionItem } from "@/lib/clientPriority";
import { useBusinessProfile } from "@/hooks/useInvoicing";

interface Props {
  item: AttentionItem | null;
  client: Client | undefined;
  onClose: () => void;
}

/** A ready-written, editable message that opens in WhatsApp or email, or copies. */
export const ReminderModal = ({ item, client, onClose }: Props) => {
  const { data: profile } = useBusinessProfile();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item || !client) return;
    const doc = item.doc;
    setText(reminderText({
      kind: item.kind,
      contactName: client.name,
      number: doc?.number ?? null,
      amount: item.amount,
      date: doc?.due_date ?? null,
      link: doc ? `${window.location.origin}/d/${doc.public_token}` : null,
      businessName: issuerDisplayName(profile ?? null),
    }));
    setCopied(false);
  }, [item, client, profile]);

  const wa = client?.phone ? whatsappLink(client.phone, text) : null;
  const subject = item?.doc?.number ? `${item.doc.number} from ${issuerDisplayName(profile ?? null)}` : `Hello from ${issuerDisplayName(profile ?? null)}`;
  const mail = client?.email ? `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand");
    }
  };

  const btn = "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition";

  return (
    <ResponsiveModal
      open={!!item}
      onClose={onClose}
      title={item?.kind === "check_in" ? "Check in" : item?.kind === "quote_expiring" ? "Follow up" : "Send a reminder"}
      description={client ? `To ${clientName(client)}. Edit anything before you send.` : undefined}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className={`${field} !mt-0 resize-y leading-relaxed`} aria-label="Message" />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" onClick={onClose} className={`${btn} bg-primary text-primary-foreground hover:bg-primary-glow`}>
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        )}
        {mail && (
          <a href={mail} onClick={onClose} className={`${btn} ${wa ? "border border-border hover:bg-secondary/40" : "bg-primary text-primary-foreground hover:bg-primary-glow"}`}>
            <Mail className="size-4" /> Email
          </a>
        )}
        <button onClick={copy} className={`${btn} border border-border hover:bg-secondary/40`}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {!wa && !mail && (
        <p className="mt-3 text-xs text-muted-foreground">Add a phone number or email to this client to send it from here.</p>
      )}
    </ResponsiveModal>
  );
};
