// Site checks for the Projects baseline: shared by the project-health function
// and its tests. Everything here reads public information only.

export type Status = "pass" | "fail" | "unknown";
export type Result = Record<string, { status: Status; detail: string | null }>;

const UA = "SIPE-HealthCheck/1.0 (+https://sipe.cnbcode.com)";
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const SLDS = new Set(["co", "or", "ac", "go", "ne", "com", "net", "org", "gov", "edu", "sc", "me", "info", "mobi", "ltd", "plc"]);

// ---------------------------------------------------------------------------
// address safety
// ---------------------------------------------------------------------------
export function privateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19));
}
export function privateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true;
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? privateV4(mapped[1]) : false;
}

/**
 * DNS lookup: the runtime's resolver first, DNS over HTTPS as a fallback.
 * Returns { type, data } answers in DoH's shape (1 = A, 28 = AAAA, 15 = MX).
 * null = the lookup itself failed, which is not the same as "no records".
 */
async function doh(name: string, type: "A" | "AAAA" | "MX"): Promise<{ type: number; data: string }[] | null> {
  const code = type === "A" ? 1 : type === "AAAA" ? 28 : 15;
  // deno-lint-ignore no-explicit-any
  const resolve = (Deno as any).resolveDns as ((n: string, t: string) => Promise<unknown[]>) | undefined;
  if (resolve) {
    try {
      const recs = await resolve(name, type);
      return recs.map((r) => ({
        type: code,
        data: type === "MX" ? `${(r as { preference: number }).preference} ${(r as { exchange: string }).exchange}` : String(r),
      }));
    } catch (e) {
      if ((e as Error).name === "NotFound") return [];
    }
  }
  return dohHttp(name, type);
}

async function dohHttp(name: string, type: "A" | "AAAA" | "MX"): Promise<{ type: number; data: string }[] | null> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.Answer) ? body.Answer : [];
  } catch {
    return null;
  }
}

export async function hostIsPublic(host: string): Promise<boolean> {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !privateV4(h);
  if (h.includes(":")) return !privateV6(h);
  const [a, aaaa] = await Promise.all([doh(h, "A"), doh(h, "AAAA")]);
  if (a === null && aaaa === null) throw new Blocked("Couldn't look up the address right now");
  const ips = [...(a ?? []).filter((r) => r.type === 1), ...(aaaa ?? []).filter((r) => r.type === 28)].map((r) => r.data);
  if (ips.length === 0) throw new Blocked("This address doesn't point anywhere (no DNS records)");
  return ips.every((ip) => (ip.includes(":") ? !privateV6(ip) : !privateV4(ip)));
}

class Blocked extends Error {}

interface Fetched { status: number; url: string; body: string; headers: Headers }

/** fetch with redirect, size and address checks on every hop */
async function safeFetch(start: string): Promise<Fetched> {
  let url = new URL(start);
  for (let hop = 0; hop <= 3; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Blocked("Only http and https addresses are checked");
    if (url.port && url.port !== "80" && url.port !== "443") throw new Blocked("Only standard ports are checked");
    if (!(await hostIsPublic(url.hostname))) throw new Blocked("This address isn't public, so it wasn't checked");
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    let body = "";
    if (res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let read = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.byteLength;
        body += dec.decode(value, { stream: true });
        if (read > MAX_BYTES) { await reader.cancel(); break; }
      }
    }
    return { status: res.status, url: url.toString(), body, headers: res.headers };
  }
  throw new Blocked("Too many redirects");
}

// ---------------------------------------------------------------------------
// page checks
// ---------------------------------------------------------------------------
const looksLikeHtml = (s: string) => /^\s*(<!doctype html|<html)/i.test(s) || /<head[\s>]/i.test(s.slice(0, 2000));

function metaTags(html: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = (a[3] ?? a[4] ?? "").trim();
    out.push(attrs);
  }
  return out;
}
const metaValue = (tags: Record<string, string>[], key: string) =>
  tags.find((t) => (t.name ?? t.property ?? "").toLowerCase() === key)?.content ?? "";

const ANALYTICS = /googletagmanager\.com|google-analytics\.com|gtag\(|plausible\.io|umami|posthog|clarity\.ms|usefathom|cdn\.usefathom|matomo|_vercel\/insights|vercel-insights|cloudflareinsights|simpleanalytics|pirsch|goatcounter|mixpanel|amplitude|segment\.com|hotjar/i;

export function pageChecks(html: string): Result {
  const tags = metaTags(html);
  const title = (html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "").trim();
  const desc = metaValue(tags, "description");
  const ogTitle = metaValue(tags, "og:title");
  const ogImage = metaValue(tags, "og:image");
  const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const spa = /<div id=["'](root|app|__next)["']>\s*<\/div>/i.test(html);
  const jsNote = spa ? " Your site seems to add its tags with JavaScript. Google runs that, but many AI tools and link previews don't." : "";
  const r: Result = {};
  r.title_meta = title && desc
    ? { status: "pass", detail: `"${title.slice(0, 70)}"` }
    : { status: "fail", detail: `${!title ? "No title" : "No meta description"} in the page's HTML.${jsNote}` };
  r.og_preview = ogTitle && ogImage
    ? { status: "pass", detail: null }
    : { status: "fail", detail: `Missing ${[!ogTitle && "og:title", !ogImage && "og:image"].filter(Boolean).join(" and ")}.${jsNote}` };
  r.schema = ld.length
    ? { status: "pass", detail: `${ld.length} block${ld.length > 1 ? "s" : ""} of JSON-LD` }
    : { status: "fail", detail: `No schema.org JSON-LD in the page's HTML.${jsNote}` };
  const faq = ld.some((b) => /FAQPage/.test(b)) || /<h[1-6][^>]*>[^<]{0,60}(FAQ|Frequently asked)/i.test(html);
  r.faq = faq ? { status: "pass", detail: null } : { status: "fail", detail: "No FAQ section or FAQPage data found on the homepage." };
  const a = html.match(ANALYTICS);
  r.analytics = a ? { status: "pass", detail: `Found ${a[0].replace(/\\/g, "")}` } : { status: "fail", detail: "No known analytics script in the page's HTML." };
  return r;
}

async function fileCheck(origin: string, path: string): Promise<Fetched | null> {
  try {
    const f = await safeFetch(origin + path);
    return f;
  } catch {
    return null;
  }
}

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  return tld.length === 2 && SLDS.has(sld) ? labels.slice(-3).join(".") : labels.slice(-2).join(".");
}

async function domainCheck(domain: string, today: Date): Promise<{ status: Status; detail: string | null; daysLeft: number | null }> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json", "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { status: "unknown", detail: `Couldn't look up ${domain} in the public registry. Check the renewal date with your registrar.`, daysLeft: null };
    const body = await res.json();
    const exp = (body.events ?? []).find((e: { eventAction?: string }) => e.eventAction === "expiration")?.eventDate;
    if (!exp) return { status: "unknown", detail: `The registry for ${domain} doesn't publish a renewal date.`, daysLeft: null };
    const days = Math.floor((new Date(exp).getTime() - today.getTime()) / 86_400_000);
    const date = new Date(exp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return days > 30
      ? { status: "pass", detail: `${domain} renews ${date}`, daysLeft: days }
      : { status: "fail", detail: days >= 0 ? `${domain} renews in ${days} day${days === 1 ? "" : "s"} (${date})` : `${domain} expired on ${date}`, daysLeft: days };
  } catch {
    return { status: "unknown", detail: "The registry lookup timed out.", daysLeft: null };
  }
}

export async function checkProject(rawUrl: string): Promise<{ result: Result; daysLeft: number | null; siteUp: number | null }> {
  const r: Result = {};
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    const bad = { status: "unknown" as Status, detail: "The project's web address isn't valid." };
    return { result: { uptime: bad }, daysLeft: null, siteUp: null };
  }
  const isIp = /^[\d.]+$|:/.test(url.hostname);
  const domain = registrableDomain(url.hostname);
  const today = new Date();

  const [dom, mx] = isIp
    ? [{ status: "unknown" as Status, detail: "The address is an IP, not a domain name.", daysLeft: null }, null]
    : await Promise.all([domainCheck(domain, today), doh(domain, "MX")]);
  r.domain = { status: dom.status, detail: dom.detail };
  // A "null MX" (exchange ".") means the domain says it takes no email (RFC 7505).
  const mxHosts = (mx ?? []).filter((x) => x.type === 15).map((x) => x.data.split(" ").pop()?.replace(/\.$/, "") ?? "").filter(Boolean);
  r.email_domain = isIp
    ? { status: "unknown", detail: "The address is an IP, not a domain name." }
    : mx === null
      ? { status: "unknown", detail: "Couldn't look up mail records right now." }
      : mxHosts.length
        ? { status: "pass", detail: `Mail handled by ${mxHosts[0]}` }
        : { status: "fail", detail: `No mail (MX) records for ${domain}, so hello@${domain} can't receive email.` };

  // Homepage: HTTPS first, then plain HTTP to tell "down" from "no HTTPS".
  let page: Fetched | null = null;
  let httpsOk = false;
  try {
    page = await safeFetch(`https://${url.host}${url.pathname}`);
    httpsOk = true;
  } catch (e) {
    if (e instanceof Blocked) {
      for (const k of ["uptime", "https", "title_meta", "og_preview", "schema", "faq", "analytics", "sitemap", "robots", "llms_txt"]) {
        r[k] = { status: "unknown", detail: e.message };
      }
      return { result: r, daysLeft: dom.daysLeft, siteUp: null };
    }
    try { page = await safeFetch(`http://${url.host}${url.pathname}`); } catch { page = null; }
  }

  if (!page) {
    r.uptime = { status: "fail", detail: "The site didn't respond within 10 seconds." };
    r.https = { status: "unknown", detail: "Couldn't check while the site is down." };
    return { result: r, daysLeft: dom.daysLeft, siteUp: 0 };
  }

  const finalHttps = page.url.startsWith("https://");
  r.https = httpsOk && finalHttps
    ? { status: "pass", detail: null }
    : { status: "fail", detail: httpsOk ? "The site redirects to plain http." : "The site only loads over plain http." };

  const blockedByBot = (page.status === 403 || page.status === 429 || page.status === 503) &&
    (page.headers.get("cf-mitigated") || /cloudflare|akamai|sucuri/i.test(page.headers.get("server") ?? ""));
  if (blockedByBot) {
    r.uptime = { status: "unknown", detail: "The site blocks automated checks (bot protection), so it couldn't be checked." };
    return { result: r, daysLeft: dom.daysLeft, siteUp: null };
  }
  if (page.status >= 400) {
    r.uptime = { status: "fail", detail: `The homepage answered with an error (HTTP ${page.status}).` };
    return { result: r, daysLeft: dom.daysLeft, siteUp: 0 };
  }
  r.uptime = { status: "pass", detail: null };
  Object.assign(r, pageChecks(page.body));

  const origin = new URL(page.url).origin;
  const [robots, sitemap, llms] = await Promise.all([
    fileCheck(origin, "/robots.txt"), fileCheck(origin, "/sitemap.xml"), fileCheck(origin, "/llms.txt"),
  ]);

  // Single-page sites answer every path with the homepage: that's "no file".
  const realText = (f: Fetched | null) => !!f && f.status === 200 && !looksLikeHtml(f.body) ? f.body : null;
  const robotsTxt = realText(robots);
  if (robotsTxt === null) {
    r.robots = { status: "pass", detail: "No robots.txt, so nothing is blocked." };
  } else {
    let star = false, blocksAll = false;
    for (const line of robotsTxt.split(/\r?\n/)) {
      const l = line.replace(/#.*/, "").trim();
      const ua = l.match(/^user-agent:\s*(.+)$/i);
      if (ua) { star = ua[1].trim() === "*"; continue; }
      if (star && /^disallow:\s*\/\s*$/i.test(l)) blocksAll = true;
    }
    r.robots = blocksAll
      ? { status: "fail", detail: "robots.txt tells all search engines to stay out (Disallow: /)." }
      : { status: "pass", detail: null };
  }
  const sitemapXml = sitemap && sitemap.status === 200 && /<(urlset|sitemapindex)\b/i.test(sitemap.body);
  const robotsSitemap = robotsTxt?.match(/^sitemap:\s*(\S+)/im)?.[1];
  r.sitemap = sitemapXml
    ? { status: "pass", detail: "/sitemap.xml" }
    : robotsSitemap
      ? { status: "pass", detail: `Listed in robots.txt: ${robotsSitemap}` }
      : { status: "fail", detail: "No /sitemap.xml and none listed in robots.txt." };
  const llmsTxt = realText(llms);
  r.llms_txt = llmsTxt && llmsTxt.trim().length > 20
    ? { status: "pass", detail: null }
    : { status: "fail", detail: "No /llms.txt." };

  return { result: r, daysLeft: dom.daysLeft, siteUp: 1 };
}

