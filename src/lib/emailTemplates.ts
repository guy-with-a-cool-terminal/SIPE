// Starting points for admin emails. Pick one, then edit before sending.
// {name} in the body is a literal placeholder for now (no per-user merge yet).

export interface EmailTemplate {
  id: string;
  label: string;
  /** default audience the template is written for */
  audience: "all" | "user";
  postToFeed: boolean;
  subject: string;
  body_md: string;
  cta_label?: string;
  cta_url?: string;
}

const WHATS_NEW = "https://sipe.cnbcode.com/whats-new";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    audience: "all",
    postToFeed: false,
    subject: "",
    body_md: "",
  },
  {
    id: "feature",
    label: "Feature announcement",
    audience: "all",
    postToFeed: true,
    subject: "New in SIPE: ",
    body_md:
      "## What changed\n\nShort summary of the feature and why it helps.\n\n- Point one\n- Point two\n- Point three\n\nOpen SIPE to try it.",
    cta_label: "See what's new",
    cta_url: WHATS_NEW,
  },
  {
    id: "maintenance",
    label: "Maintenance / downtime notice",
    audience: "all",
    postToFeed: false,
    subject: "Scheduled maintenance on SIPE",
    body_md:
      "We'll be doing short maintenance on **{date}** from **{start}** to **{end}** (EAT).\n\nYou may see brief errors while signing in or recording deposits during that window. Nothing in your data is affected.\n\nThanks for your patience.",
  },
  {
    id: "welcome",
    label: "Onboarding nudge",
    audience: "user",
    postToFeed: false,
    subject: "Getting started with SIPE",
    body_md:
      "Welcome to SIPE.\n\nThree things to set up first:\n\n- Set your S/I/P/E split in Settings so every deposit is allocated the way you want\n- Add your accounts (bank, M-Pesa, platforms) so you can see where money actually sits\n- Set one goal and pick how it's funded\n\nReply to this email if anything is unclear.",
    cta_label: "Open SIPE",
    cta_url: "https://sipe.cnbcode.com/dashboard",
  },
  {
    id: "reengage",
    label: "Re-engagement",
    audience: "user",
    postToFeed: false,
    subject: "Your SIPE buckets are waiting",
    body_md:
      "It's been a while since your last deposit was recorded in SIPE.\n\nEven a quick catch-up keeps your Savings, Investments, Pay-yourself and Expenses balances honest, and your weekly review useful.",
    cta_label: "Record a deposit",
    cta_url: "https://sipe.cnbcode.com/dashboard",
  },
];

export const templateById = (id: string) => EMAIL_TEMPLATES.find((t) => t.id === id);
