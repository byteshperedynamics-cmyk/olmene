// free-audit — instant, free, deterministic marketing diagnosis.
// Crawls the homepage (SSRF-safe), computes the same 18-point SEO checklist
// used by full reports, derives a marketing score + top findings, and returns
// them for the landing-page "free diagnosis" funnel. No LLM cost, no auth.
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import * as cheerio from "npm:cheerio@1.0.0";

// ─── CORS ────────────────────────────────────────────────────────────────
const APP_URL = Deno.env.get("APP_URL") ?? "https://get.marketwiselabs.workers.dev";
// Reflect the request origin when it matches a known surface (prod, previews, local dev).
const ORIGIN_ALLOW = [
  APP_URL,
  "https://get.marketwiselabs.workers.dev",
  /^https:\/\/preview-[a-z0-9-]+\.space-z\.ai$/,
  /^https:\/\/[a-z0-9-]+\.marketwiselabs\.workers.dev$/,
  "http://localhost:3000",
];
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ORIGIN_ALLOW.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : APP_URL,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (b: unknown, s = 200, cors?: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...(cors ?? {}) } });

// ─── URL validation (SSRF-safe, mirrors the main pipeline) ──────────────
const ALLOWED_PORTS = new Set([80, 443]);
const BAD_HOST_SUFFIXES = ["localhost", "local", "internal", "home.arpa", "invalid", "test", "example", "onion"];

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts;
}
function ipv4BadReason(parts: number[]): string | null {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return "private/loopback range";
  if (a === 169 && b === 254) return "link-local range";
  if (a === 172 && b >= 16 && b <= 31) return "private range";
  if (a === 192 && b === 168) return "private range";
  if (a === 100 && b >= 64 && b <= 127) return "CGNAT range";
  if (a >= 224) return "multicast/reserved range";
  return null;
}
function hostnameUnsafeReason(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host) return "empty hostname";
  if (host.includes(":")) return null; // IPv6 literal — rare; DNS check still applies
  const labels = host.split(".");
  if (labels.length < 2) return `dotless hostname '${host}'`;
  for (const label of labels) {
    if (!/^[a-z0-9-]+$/.test(label)) return `invalid label '${label}'`;
    if (label.startsWith("-") || label.endsWith("-")) return `invalid label '${label}'`;
  }
  const tld = labels[labels.length - 1];
  if (BAD_HOST_SUFFIXES.includes(tld)) return `forbidden suffix '.${tld}'`;
  if (labels.includes("localhost")) return "localhost";
  const v4 = parseIPv4(host);
  if (v4) {
    const reason = ipv4BadReason(v4);
    if (reason) return `IPv4 in ${reason}`;
  }
  return null;
}
function normalizeSiteUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  url.hash = "";
  url.search = "";
  return url;
}
async function assertDnsSafe(hostname: string): Promise<void> {
  const resolveDns = (globalThis as { Deno?: { resolveDns?: (n: string, t: string) => Promise<string[]> } }).Deno?.resolveDns;
  if (typeof resolveDns !== "function") return;
  const isV6 = hostname.includes(":");
  const answers = await resolveDns(hostname, isV6 ? "AAAA" : "A").catch(() => [] as string[]);
  const both = answers.length ? answers : await resolveDns(hostname, isV6 ? "A" : "AAAA").catch(() => [] as string[]);
  for (const raw of both) {
    const ip = raw.replace(/^\[|\]$/g, "");
    const v4 = parseIPv4(ip);
    if (v4) {
      const reason = ipv4BadReason(v4);
      if (reason) throw new Error(`resolved to private address ${ip}`);
    }
  }
}

// ─── Fetch (10s timeout, 1MB cap, 3 redirects, HTML only) ───────────────
const USER_AGENT = "MarketwiseBot/1.0 (+https://get.marketwiselabs.workers.dev)";
const MAX_BYTES = 1024 * 1024;

async function fetchPage(rawUrl: URL, timeoutMs = 10_000): Promise<{ url: string; html: string }> {
  let current = rawUrl;
  await assertDnsSafe(current.hostname);
  for (let hop = 0; hop <= 3; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store", // an audit must read the page as it is right now — never a cached copy
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      });
    } catch (e) {
      clearTimeout(timer);
      throw new Error(`fetch failed: ${(e as Error).message}`);
    }
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("redirect without location");
      if (hop === 3) throw new Error("too many redirects (max 3)");
      const next = new URL(location, current);
      const reason = hostnameUnsafeReason(next.hostname);
      if (reason) throw new Error(`redirect target rejected: ${reason}`);
      if (next.port && !ALLOWED_PORTS.has(Number(next.port))) throw new Error("redirect to bad port");
      await assertDnsSafe(next.hostname);
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`content-type '${contentType}' is not HTML`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("empty body");
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error("body exceeds 1 MB cap");
        }
        chunks.push(value);
      }
    }
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return { url: current.toString(), html: new TextDecoder("utf-8", { fatal: false }).decode(out) };
  }
  throw new Error("unreachable");
}

async function probeOk(url: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store", headers: { "User-Agent": USER_AGENT } });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Deterministic signals (same checks as full reports) ────────────────
const CTA_VERBS = [
  "get started", "start free", "start your free", "try ", "sign up", "sign-up", "signup",
  "book a demo", "book demo", "request demo", "get a demo", "buy", "purchase", "subscribe",
  "start trial", "free trial", "start now", "try free", "talk to", "contact us", "get in touch", "create account",
];
const TRUST_KEYWORDS = [
  "testimonial", "review", "case study", "case studies", "our customers", "trusted by", "as seen in",
  "guarantee", "money-back", "refund", "secure checkout", "gdpr", "soc 2", "soc2", "iso 27001",
  "privacy shield", "4.9", "5-star", "rated",
];

interface Check { check: string; status: "pass" | "warn" | "fail"; detail: string }
interface Signals {
  pageUrl: string; titleText: string | null; titleLength: number | null;
  metaDescription: string | null; metaDescriptionLength: number | null;
  h1Count: number; h1Texts: string[]; headingOutline: string[];
  canonical: string | null; lang: string | null; viewport: boolean;
  openGraph: boolean; twitterCard: boolean; jsonLdTypes: string[];
  imagesWithoutAlt: number; imagesTotal: number; internalLinks: number; externalLinks: number;
  wordCount: number; hasPricingPage: boolean; ctaButtons: string[]; trustSignals: string[];
  robotsMeta: string | null; robotsTxtOk: boolean; sitemapXmlOk: boolean; checklist: Check[];
}

function computeSeoSignals(html: string, pageUrl: string, extras: { robotsTxtOk: boolean; sitemapXmlOk: boolean }): Signals {
  const $ = cheerio.load(html);
  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const read = (n: Record<string, unknown>) => {
        const t = n?.["@type"];
        if (typeof t === "string") jsonLdTypes.push(t);
        else if (Array.isArray(t)) jsonLdTypes.push(...(t as string[]).filter((x) => typeof x === "string"));
        // @graph collections — used by Next.js, Yoast, RankMath and most modern CMS output
        const g = n?.["@graph"];
        if (Array.isArray(g)) for (const gn of g) read(gn as Record<string, unknown>);
      };
      for (const n of nodes) read(n as Record<string, unknown>);
    } catch {
      jsonLdTypes.push("(invalid JSON-LD)");
    }
  });
  $("script, style, noscript, svg, iframe, template").remove();
  const titleText = ($("title").first().text() || "").trim();
  const titleLength = titleText ? titleText.length : null;
  const metaDescRaw = $('meta[name="description"]').attr("content")?.trim() ?? null;
  const metaDescription = metaDescRaw && metaDescRaw.length > 0 ? metaDescRaw : null;
  const h1s: string[] = [];
  $("h1").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) h1s.push(t);
  });
  const headingOutline: string[] = [];
  $("h2, h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) headingOutline.push(`${(el as unknown as { tagName: string }).tagName}: ${t.slice(0, 80)}`);
  });
  headingOutline.splice(30);
  const canonical = $('link[rel="canonical"]').attr("href") ?? null;
  const lang = $("html").attr("lang")?.trim() || null;
  const viewport = !!$('meta[name="viewport"]').attr("content");
  const openGraph = $('meta[property^="og:"]').length >= 2;
  const twitterCard = !!$('meta[name^="twitter:"]').attr("content");
  let imagesTotal = 0, imagesWithoutAlt = 0;
  $("img").each((_, el) => {
    imagesTotal++;
    const alt = $(el).attr("alt");
    if (!alt || !alt.trim()) imagesWithoutAlt++;
  });
  let pageOrigin = "";
  try { pageOrigin = new URL(pageUrl).origin; } catch { /* ignore */ }
  let internalLinks = 0, externalLinks = 0, hasPricingPage = false;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const low = href.toLowerCase();
    if (/pricing|plans|preis|tarif|tarife|cennik|preços|precos/.test(low) || /pricing|plans/.test($(el).text().toLowerCase())) hasPricingPage = true;
    try {
      const u = new URL(href, pageUrl);
      if (u.origin === pageOrigin) internalLinks++;
      else externalLinks++;
    } catch { /* ignore */ }
  });
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 12000);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const ctaButtons: string[] = [];
  $("a, button, [role=button], input[type=submit]").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim() || $(el).attr("value")?.trim() || "";
    if (!t || t.length > 60) return;
    const low = ` ${t.toLowerCase()} `;
    if (CTA_VERBS.some((v) => low.includes(v)) && !ctaButtons.includes(t)) ctaButtons.push(t);
    if (ctaButtons.length >= 8) return;
  });
  const lowText = text.toLowerCase();
  const trustSignals = TRUST_KEYWORDS.filter((k) => lowText.includes(k));
  const robotsMeta = $('meta[name="robots"]').attr("content")?.trim() || null;

  const s = {
    pageUrl, titleText, titleLength, metaDescription,
    metaDescriptionLength: metaDescription ? metaDescription.length : null,
    h1Count: h1s.length, h1Texts: h1s.slice(0, 5), headingOutline,
    canonical, lang, viewport, openGraph, twitterCard, jsonLdTypes,
    imagesWithoutAlt, imagesTotal, internalLinks, externalLinks, wordCount,
    hasPricingPage, ctaButtons, trustSignals, robotsMeta,
    robotsTxtOk: extras.robotsTxtOk, sitemapXmlOk: extras.sitemapXmlOk,
    checklist: [] as Check[],
  };
  s.checklist = buildChecklist(s);
  return s;
}

function buildChecklist(s: Omit<Signals, "checklist">): Check[] {
  const c: Check[] = [];
  const push = (check: string, status: Check["status"], detail: string) => c.push({ check, status, detail });
  push("Title tag", s.titleLength === null ? "fail" : s.titleLength >= 10 && s.titleLength <= 60 ? "pass" : "warn",
    s.titleLength === null ? "No <title> found" : `${s.titleLength} characters (aim for 10\u201360)`);
  push("Meta description", s.metaDescription === null ? "fail" : s.metaDescriptionLength! >= 50 && s.metaDescriptionLength! <= 160 ? "pass" : "warn",
    s.metaDescription === null ? "No meta description found" : `${s.metaDescriptionLength} characters (aim for 50\u2013160)`);
  push("Single H1", s.h1Count === 1 ? "pass" : s.h1Count === 0 ? "fail" : "warn",
    s.h1Count === 1 ? "Exactly one H1" : `${s.h1Count} H1 tags found (use exactly one)`);
  push("Heading structure", s.headingOutline.length >= 3 ? "pass" : s.headingOutline.length >= 1 ? "warn" : "fail", `${s.headingOutline.length} H2/H3 headings`);
  push("Canonical URL", s.canonical ? "pass" : "warn", s.canonical ?? "No canonical link");
  push("Language attribute", s.lang ? "pass" : "warn", s.lang ? `lang="${s.lang}"` : "No lang attribute on <html>");
  push("Mobile viewport", s.viewport ? "pass" : "fail", s.viewport ? "viewport meta present" : "No viewport meta tag");
  push("Open Graph tags", s.openGraph ? "pass" : "warn", s.openGraph ? "og: tags present" : "Few or no og: tags (worse social previews)");
  push("Twitter card", s.twitterCard ? "pass" : "warn", s.twitterCard ? "twitter: meta present" : "No twitter: tags");
  push("Structured data (JSON-LD)", s.jsonLdTypes.length ? "pass" : "warn", s.jsonLdTypes.length ? `@type: ${s.jsonLdTypes.join(", ")}` : "No JSON-LD found");
  push("Image alt coverage", s.imagesTotal === 0 ? "warn" : s.imagesWithoutAlt / s.imagesTotal <= 0.1 ? "pass" : s.imagesWithoutAlt / s.imagesTotal <= 0.5 ? "warn" : "fail",
    s.imagesTotal === 0 ? "No images found on the homepage" : `${s.imagesWithoutAlt} of ${s.imagesTotal} images missing alt text`);
  push("Content depth", s.wordCount >= 300 ? "pass" : s.wordCount >= 100 ? "warn" : "fail", `~${s.wordCount} words of body text (aim for 300+)`);
  push("Pricing page", s.hasPricingPage ? "pass" : "warn", s.hasPricingPage ? "Pricing page linked from the homepage" : "No pricing link found on the homepage");
  push("Call-to-action", s.ctaButtons.length ? "pass" : "fail", s.ctaButtons.length ? `Found: ${s.ctaButtons.slice(0, 4).join(" | ")}` : "No clear CTA button/link detected");
  push("Trust signals", s.trustSignals.length >= 2 ? "pass" : s.trustSignals.length === 1 ? "warn" : "fail",
    s.trustSignals.length ? `Found: ${s.trustSignals.slice(0, 4).join(", ")}` : "No testimonials/reviews/guarantees detected");
  const noindex = !!s.robotsMeta && /noindex/i.test(s.robotsMeta);
  push("Robots meta", noindex ? "fail" : "pass", noindex ? "Page is set to noindex!" : s.robotsMeta ? `robots: ${s.robotsMeta}` : "No restrictions");
  push("/robots.txt", s.robotsTxtOk ? "pass" : "warn", s.robotsTxtOk ? "Reachable (200)" : "Not reachable");
  push("/sitemap.xml", s.sitemapXmlOk ? "pass" : "warn", s.sitemapXmlOk ? "Reachable (200)" : "Not reachable");
  return c;
}

// ─── Scoring + findings ──────────────────────────────────────────────────
// Every finding is a DETERMINISTIC fact from the HTML. The business meaning is
// shipped alongside as a clearly-labelled *hypothesis* (impact + impactHypothesis)
// — the fact stays factual, the interpretation is marked as interpretation.
interface Finding {
  title: string;
  severity: "critical" | "high" | "medium";
  evidence: string;
  whatToChange: string;
  impact: string; // short label, e.g. "conversion friction"
  impactHypothesis: string; // business implication, labelled as hypothesis in the UI
}

function scoreFromChecks(checks: Check[]): number {
  const pts = checks.reduce((n, c) => n + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return Math.round((pts / checks.length) * 100);
}

function buildFindings(s: Signals): Finding[] {
  const f: Finding[] = [];
  if (s.h1Count === 0) f.push({ title: "Your homepage has no H1 headline", severity: "high", evidence: "No <h1> element found in your homepage HTML.", whatToChange: "Add one clear H1 that states what you sell and for whom \u2014 search engines and visitors read it first." });
  else if (s.h1Texts[0] && s.h1Texts[0].length < 12 && s.wordCount > 50) f.push({ title: "Your H1 headline is too vague", severity: "medium", evidence: `Your H1 reads \u201c${s.h1Texts[0]}\u201d \u2014 it names the object, not the buyer or the outcome.`, whatToChange: "Rewrite the H1 around the customer outcome (\u201cwhat changes for me if I buy\u201d), not the product category." });
  if (s.ctaButtons.length === 0) f.push({ title: "No clear call-to-action on the homepage", severity: "critical", evidence: "No button or link with a purchase/start intent was detected in your HTML.", whatToChange: "Add one primary CTA above the fold \u2014 a single, specific next step for the visitor." });
  if (!s.hasPricingPage) f.push({ title: "Pricing is hidden from the homepage", severity: "high", evidence: "No link containing \u201cpricing\u201d/\u201cplans\u201d was found on your homepage.", whatToChange: "Link your pricing page from the header or hero \u2014 hidden pricing is one of the top reasons qualified visitors leave." });
  if (s.trustSignals.length === 0) f.push({ title: "No visible trust signals", severity: "high", evidence: "No testimonials, reviews, guarantees or customer references were detected on the homepage.", whatToChange: "Add a short proof strip under the hero: 2\u20133 customer quotes, a rating, or recognizable logos." });
  else if (s.trustSignals.length === 1) f.push({ title: "Thin trust signals", severity: "medium", evidence: `Only one trust signal found (${s.trustSignals[0]}).`, whatToChange: "Combine reviews, a guarantee and named customers \u2014 one signal alone rarely convinces." });
  if (s.metaDescription === null) f.push({ title: "Missing meta description", severity: "medium", evidence: "Your homepage has no meta description \u2014 search engines improvise your snippet.", whatToChange: "Write a 120\u2013160 character description with your value proposition and a reason to click." });
  else if (s.metaDescriptionLength! < 50) f.push({ title: "Meta description is too short", severity: "medium", evidence: `${s.metaDescriptionLength} characters \u2014 search engines may rewrite it.`, whatToChange: "Extend it to 120\u2013160 characters: what you sell, for whom, and why it beats the alternative." });
  if (s.wordCount < 300) f.push({ title: "Homepage has very little content", severity: s.wordCount < 100 ? "high" : "medium", evidence: `~${s.wordCount} words of readable text on the homepage.`, whatToChange: "Aim for 300+ words: explain the problem you solve, for whom, and how \u2014 it feeds both SEO and persuasion." });
  if (s.imagesTotal > 0 && s.imagesWithoutAlt / s.imagesTotal > 0.5) f.push({ title: "Images are invisible to search engines", severity: "medium", evidence: `${s.imagesWithoutAlt} of ${s.imagesTotal} images have no alt text.`, whatToChange: "Describe each image in one short sentence \u2014 it's free SEO and accessibility." });
  if (s.jsonLdTypes.length === 0) f.push({ title: "No structured data (JSON-LD)", severity: "medium", evidence: "Your homepage has no schema.org markup.", whatToChange: "Add Organization/Product JSON-LD so search engines can build rich results for your brand." });
  if (!s.openGraph) f.push({ title: "Weak social previews", severity: "medium", evidence: "Few or no og: meta tags found \u2014 shared links look bare.", whatToChange: "Add og:title, og:description and og:image so your links preview properly everywhere." });
  if (!s.robotsTxtOk || !s.sitemapXmlOk) f.push({ title: "Crawlability gaps", severity: "medium", evidence: `robots.txt ${s.robotsTxtOk ? "OK" : "missing/unreachable"}, sitemap.xml ${s.sitemapXmlOk ? "OK" : "missing/unreachable"}.`, whatToChange: "Publish a sitemap.xml and reference it from robots.txt so every key page gets indexed." });
  if (s.titleLength !== null && (s.titleLength < 10 || s.titleLength > 60)) f.push({ title: "Title tag length is off", severity: "medium", evidence: `\u201c${s.titleText}\u201d is ${s.titleLength} characters (aim 10\u201360).`, whatToChange: "Rewrite the title as: product \u2014 primary benefit \u2014 brand, under 60 characters." });
  return f;
}

// Deterministic impact hypotheses, keyed by finding title. The finding itself is
// a fact computed from HTML; the business meaning is this labelled hypothesis —
// the UI always presents it as "impact hypothesis", never as measured fact.
const IMPACT_HYPOTHESES: Record<string, { impact: string; impactHypothesis: string }> = {
  "Your homepage has no H1 headline": { impact: "clarity", impactHypothesis: "First-time visitors may not grasp what you sell in the first seconds \u2014 the H1 is what both humans and Google read first." },
  "Your H1 headline is too vague": { impact: "clarity", impactHypothesis: "Visitors may understand your category but not the outcome they get \u2014 vague headlines are forgotten before the scroll." },
  "No clear call-to-action on the homepage": { impact: "conversion friction", impactHypothesis: "An interested visitor with no obvious next step usually leaves \u2014 you may be paying for traffic that never gets asked to act." },
  "Pricing is hidden from the homepage": { impact: "conversion friction", impactHypothesis: "Visitors actively evaluating your product may have to hunt for pricing \u2014 many qualified buyers bounce instead." },
  "No visible trust signals": { impact: "trust deficit", impactHypothesis: "Every claim you make is taken on faith \u2014 first-time buyers may hesitate at the exact moment they were ready to act." },
  "Thin trust signals": { impact: "trust deficit", impactHypothesis: "A skeptical visitor needs corroboration \u2014 a single signal rarely tips the decision." },
  "Missing meta description": { impact: "click-through loss", impactHypothesis: "Search engines improvise your snippet \u2014 you may lose the click to pages that control their own pitch." },
  "Meta description is too short": { impact: "click-through loss", impactHypothesis: "An under-used description wastes your one free pitch in search results." },
  "Homepage has very little content": { impact: "persuasion gap", impactHypothesis: "Visitors may not find enough substance to evaluate you \u2014 thin pages convert and rank worse." },
  "Images are invisible to search engines": { impact: "visibility loss", impactHypothesis: "You may be forfeiting image-search discovery and accessibility \u2014 free channels you already paid to create." },
  "No structured data (JSON-LD)": { impact: "visibility loss", impactHypothesis: "Search engines can't build rich results for your brand \u2014 you may be invisible in enhanced listings." },
  "Weak social previews": { impact: "referral loss", impactHypothesis: "Word-of-mouth clicks may be dying on arrival \u2014 a bare link is a weak recommendation." },
  "Crawlability gaps": { impact: "indexing risk", impactHypothesis: "Search engines may struggle to discover your key pages \u2014 a page that isn't crawled can't rank." },
  "Title tag length is off": { impact: "click-through loss", impactHypothesis: "Your title competes for every search click \u2014 truncated or under-used means clicks left on the table." },
};

function biggestOpportunity(s: Signals): { title: string; why: string } {
  if (s.ctaButtons.length === 0) return { title: "Add one clear call-to-action above the fold", why: "Right now a convinced visitor has no obvious next step \u2014 a single specific CTA is usually the fastest conversion win on any page." };
  if (!s.hasPricingPage) return { title: "Surface your pricing from the homepage", why: "Visitors who can't find pricing assume the product is too expensive for them and leave. A visible pricing link pre-qualifies your traffic." };
  if (s.trustSignals.length === 0) return { title: "Add a proof strip under your hero", why: "Two or three customer quotes or a rating directly under the headline is the highest-leverage trust builder for a small brand." };
  if (s.wordCount < 300) return { title: "Expand your homepage message", why: "Your page doesn't give the story enough room to persuade. 300+ words explaining problem, audience and differentiation converts and ranks better." };
  if (s.jsonLdTypes.length === 0) return { title: "Add structured data", why: "JSON-LD markup lets search engines show rich results (reviews, product, FAQ) \u2014 free visibility for a few lines of code." };
  return { title: "Tighten your hero around a measurable outcome", why: "Your fundamentals are solid \u2014 the next gain comes from sharper positioning: lead with the customer outcome, not the product category." };
}

function subScores(s: Signals) {
  const seo = scoreFromChecks(s.checklist.filter((c) => ["Title tag", "Meta description", "Single H1", "Heading structure", "Canonical URL", "Language attribute", "Open Graph tags", "Twitter card", "Structured data (JSON-LD)", "Image alt coverage", "Robots meta", "/robots.txt", "/sitemap.xml"].includes(c.check)));
  const messaging = Math.round(Math.min(100, 20 + (s.h1Count === 1 ? 25 : 5) + Math.min(25, s.wordCount / 20) + (s.titleLength && s.titleLength >= 10 && s.titleLength <= 60 ? 15 : 5) + (s.metaDescription ? 15 : 0)));
  const conversion = Math.round(Math.min(100, (s.ctaButtons.length ? 45 : 0) + (s.hasPricingPage ? 25 : 0) + Math.min(20, s.trustSignals.length * 8) + Math.min(10, s.ctaButtons.length * 4)));
  const overall = Math.round(seo * 0.4 + messaging * 0.3 + conversion * 0.3);
  return { overall, seo, messaging, conversion };
}

// ─── Main ────────────────────────────────────────────────────────────────
const RATE_LIMIT = 8; // per IP per hour
const supabase = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405, cors);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: { code: "invalid_body", message: "Expected JSON body." } }, 400, cors);
  }
  const url = normalizeSiteUrl(String(body.url ?? ""));
  if (!url) return json({ error: { code: "invalid_url", message: "Enter a valid website URL, e.g. https://example.com" } }, 400, cors);

  const db = supabase();
  const ip = clientIp(req);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  try {
    const { count } = await db.from("free_audits").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo);
    if ((count ?? 0) >= RATE_LIMIT) {
      return json({ error: { code: "rate_limited", message: "You've run several free audits recently. Try again in a little while." } }, 429, cors);
    }
  } catch { /* rate limit best-effort */ }

  let home: { url: string; html: string };
  try {
    home = await fetchPage(url);
  } catch (e) {
    return json({ error: { code: "fetch_failed", message: `We couldn't read that site (${(e as Error).message}). Check the URL and try again.` } }, 422, cors);
  }

  const [robotsTxtOk, sitemapXmlOk] = await Promise.all([
    probeOk(`${new URL(home.url).origin}/robots.txt`),
    probeOk(`${new URL(home.url).origin}/sitemap.xml`),
  ]);
  const signals = computeSeoSignals(home.html, home.url, { robotsTxtOk, sitemapXmlOk });
  const findings = buildFindings(signals).sort((a, b) => ({ critical: 0, high: 1, medium: 2 })[a.severity] - ({ critical: 0, high: 1, medium: 2 })[b.severity]);
  // Attach the labelled business-impact hypothesis to each deterministic finding.
  for (const finding of findings) {
    const h = IMPACT_HYPOTHESES[finding.title] ?? { impact: "growth friction", impactHypothesis: "Left unfixed, this likely slows some visitors on their way to becoming customers." };
    finding.impact = h.impact;
    finding.impactHypothesis = h.impactHypothesis;
  }
  const highImpactCount = findings.filter((x) => x.severity === "critical" || x.severity === "high").length;
  const scores = subScores(signals);
  const opportunity = biggestOpportunity(signals);
  const passed = signals.checklist.filter((c) => c.status === "pass").length;

  // Record the audit (rate limiting) — must be awaited so the row persists.
  await db.from("free_audits").insert({ ip, url: home.url.slice(0, 2048) }).then(() => {}, () => {});
  // Opportunistic prune of day-old rows (1% of requests).
  if (Math.random() < 0.01) {
    await db.from("free_audits").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString()).then(() => {}, () => {});
  }

  return json({
    siteUrl: home.url,
    fetchedAt: new Date().toISOString(),
    scores,
    passedChecks: passed,
    totalChecks: signals.checklist.length,
    highImpactCount,
    findings: findings.slice(0, 4),
    hiddenFindings: Math.max(0, findings.length - 4),
    opportunity,
    checklist: signals.checklist,
    stats: {
      wordCount: signals.wordCount,
      images: signals.imagesTotal,
      imagesWithoutAlt: signals.imagesWithoutAlt,
      internalLinks: signals.internalLinks,
      externalLinks: signals.externalLinks,
      ctaButtons: signals.ctaButtons.slice(0, 5),
      trustSignals: signals.trustSignals.slice(0, 5),
      h1: signals.h1Texts[0] ?? null,
      title: signals.titleText,
      hasStructuredData: signals.jsonLdTypes.length > 0,
      hasPricingPage: signals.hasPricingPage,
    },
  }, 200, cors);
});
