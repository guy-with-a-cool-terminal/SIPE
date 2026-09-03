// Resend wrapper + shared HTML shell for all SIPE outbound email.

const DEFAULT_FROM = "SIPE <noreply@cnbcode.com>";
const APP_URL = "https://sipe.cnbcode.com";

/** SIPE email palette — mirrors the dark app theme, brand blue accent. */
export const EMAIL = {
  bg: "#0b1120",
  card: "#131c31",
  inset: "#0e1526",
  border: "#25304a",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textFaint: "#64748b",
  brand: "#38bdf8",       // links / accents on dark
  brandDeep: "#0284c7",   // filled CTA (white text passes AA)
  good: "#22c55e",
  bad: "#ef4444",
} as const;

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id: string | null;
  error: string | null;
}

export async function sendEmail(
  { to, subject, html, from }: SendEmailArgs,
): Promise<SendEmailResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, id: null, error: "RESEND_API_KEY not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ from: from || DEFAULT_FROM, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Resend error:", JSON.stringify(err));
    return { ok: false, id: null, error: JSON.stringify(err) };
  }

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  return { ok: true, id: (data?.id as string) ?? null, error: null };
}

export function unsubscribeUrl(token: string): string {
  // Points at the public `unsubscribe` edge function (no-verify-jwt), which
  // renders a small preference page. Falls back to the app route if the
  // function URL isn't resolvable.
  const base = Deno.env.get("SUPABASE_URL");
  if (base) return `${base}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
  return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function dashboardUrl(): string {
  return APP_URL;
}

export interface ShellArgs {
  heading: string;
  subtitle?: string;
  bodyHtml: string;
  /** When set, a footer "unsubscribe" line is rendered. */
  unsubscribeToken?: string | null;
  footerNote?: string;
}

/** Wraps section HTML in the shared SIPE email chrome (dark, brand-blue accent). */
export function emailShell(
  { heading, subtitle, bodyHtml, unsubscribeToken, footerNote }: ShellArgs,
): string {
  const unsubLine = unsubscribeToken
    ? `<p style="margin:8px 0 0;font-size:12px;color:${EMAIL.textFaint};text-align:center">
         <a href="${unsubscribeUrl(unsubscribeToken)}" style="color:${EMAIL.textFaint};text-decoration:underline">Unsubscribe from these emails</a>
       </p>`
    : "";
  const note = footerNote
    ? `<p style="margin:0 0 6px;font-size:12px;color:${EMAIL.textFaint};text-align:center">${footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${EMAIL.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${EMAIL.text}">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="text-align:center;padding:8px 0 24px">
      <img src="${APP_URL}/logo.png" width="40" height="40" alt="SIPE"
           style="vertical-align:middle;border:0" />
      <span style="vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;letter-spacing:0.02em;color:${EMAIL.text}">SIPE</span>
    </div>
    <div style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-radius:16px;overflow:hidden">
      <div style="padding:28px 32px 4px">
        <h1 style="margin:0;font-size:21px;font-weight:700;color:${EMAIL.text}">${heading}</h1>
        ${subtitle ? `<p style="margin:6px 0 0;font-size:14px;color:${EMAIL.textDim}">${subtitle}</p>` : ""}
      </div>
      <div style="padding:20px 32px 28px">
        ${bodyHtml}
        <p style="margin:24px 0 0;font-size:12px;color:${EMAIL.textFaint};text-align:center">
          Open your <a href="${dashboardUrl()}" style="color:${EMAIL.brand};text-decoration:none">SIPE dashboard</a>
        </p>
        ${note}
        ${unsubLine}
      </div>
    </div>
    <p style="margin:20px 0 0;font-size:11px;color:${EMAIL.textFaint};text-align:center">
      SIPE, money on purpose for freelancers.
    </p>
  </div>
</body>
</html>`;
}

/** A branded CTA button row for email bodies. */
export function emailButton(label: string, url: string): string {
  return `<p style="margin:20px 0 0"><a href="${url}" style="display:inline-block;background:${EMAIL.brandDeep};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${label}</a></p>`;
}
