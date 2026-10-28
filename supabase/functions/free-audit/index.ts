// free-audit — instant, free, deterministic marketing diagnosis.
// Crawls the homepage (SSRF-safe), computes the same 21-point SEO checklist
// used by full reports, derives a marketing score + top findings, and returns
// them for the landing-page "free diagnosis" funnel. No LLM cost, no auth.
//
// Also (2026-10-13): every scan is saved and gets a `scanId` (share links,
// carrying the scan through sign-in, free fix previews, monitoring); POST
// {scanId} reads one back. JavaScript-built pages are rendered (when
// Cloudflare Browser Rendering is configured) or their content checks are
// marked "not measured" instead of failed. `platform` says whether Olmene
// can fix the site by pull request; `extras` holds unscored checks (AI
// crawlers, llms.txt, redirects, og:image, weight, broken links, CrUX).
// Monitoring calls in with the cron secret to bypass the per-IP limit.
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import * as cheerio from "npm:cheerio@1.0.0";
import { CONTENT_CHECKS, CONTENT_FIELDS, CONTENT_FINDINGS, detectPlatform, runExtraChecks, type SafeFetch } from "./extras.ts";
import { looksLikeJsShell, renderingConfigured, renderPage } from "../_shared/render.ts";
import { recordUsage } from "../_shared/ledger.ts";
import { smallJsonCall } from "../_shared/llm.ts";
import { analyzeBusiness, previewData } from "./business.ts";
import { capture, type Shot, SHOT_VIEWPORT } from "./shot.ts";
import { assembleProposals, fieldsToRewrite, langFromChecklist, type ProposalInput, proposalPrompt, validateProposal } from "./proposals.ts";

// ─── CORS ────────────────────────────────────────────────────────────────
const APP_URL = Deno.env.get("APP_URL") ?? "https://olmene.com";
// Reflect the request origin when it matches a known surface (prod, previews, local dev).
const ORIGIN_ALLOW = [
  APP_URL,
  "https://olmene.com",
  "https://www.olmene.com",
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  if (host.includes(":")) return "IPv6 literal addresses are not scanned";
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
function ipv6BadReason(ip: string): string | null {
  const a = ip.toLowerCase();
  if (a === "::" || a === "::1") return "loopback/unspecified";
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return "unique-local range";
  if (/^fe[89ab][0-9a-f]:/.test(a)) return "link-local range";
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const v4 = parseIPv4(mapped[1]);
    if (v4 && ipv4BadReason(v4)) return "IPv4-mapped private address";
  }
  return null;
}

/** Thrown when a URL may not be fetched (private/local/odd target). */
class TargetRejected extends Error {}

async function assertDnsSafe(hostname: string): Promise<void> {
  const resolveDns = (globalThis as { Deno?: { resolveDns?: (n: string, t: string) => Promise<string[]> } }).Deno?.resolveDns;
  if (typeof resolveDns !== "function") return;
  const isV6 = hostname.includes(":");
  const answers = await resolveDns(hostname, isV6 ? "AAAA" : "A").catch(() => [] as string[]);
  const both = answers.length ? answers : await resolveDns(hostname, isV6 ? "A" : "AAAA").catch(() => [] as string[]);
  // Fail closed: a name that does not resolve is never fetched. Usually a
  // typo, so it gets its own message rather than "can't be scanned".
  if (both.length === 0) throw new ScanError("no_such_domain", `could not resolve ${hostname}`);
  for (const raw of both) {
    const ip = raw.replace(/^\[|\]$/g, "");
    const v4 = parseIPv4(ip);
    const reason = v4 ? ipv4BadReason(v4) : ip.includes(":") ? ipv6BadReason(ip) : null;
    if (reason) throw new TargetRejected(`resolved to a ${reason} address`);
  }
}

/** Every outbound URL — the page, robots.txt, sitemaps, favicon, each redirect hop. */
async function assertSafeTarget(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new TargetRejected("only http(s) URLs are scanned");
  if (url.username || url.password) throw new TargetRejected("URLs with credentials are not scanned");
  const reason = hostnameUnsafeReason(url.hostname);
  if (reason) throw new TargetRejected(reason);
  if (url.port && !ALLOWED_PORTS.has(Number(url.port))) throw new TargetRejected(`port ${url.port} is not scanned`);
  await assertDnsSafe(url.hostname);
}

/** fetch with manual, validated redirects (max 3 hops). */
async function safeFetch(start: URL, init: RequestInit, timeoutMs: number): Promise<{ res: Response; url: URL }> {
  let current = start;
  for (let hop = 0; hop <= 3; hop++) {
    await assertSafeTarget(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), { ...init, redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new ScanError("unreachable", "redirect without a location");
      current = new URL(location, current);
      continue;
    }
    return { res, url: current };
  }
  throw new ScanError("too_many_redirects", "too many redirects (max 3)");
}

/** Typed scan failures — the handler turns them into honest, user-facing messages. */
class ScanError extends Error {
  constructor(public code: "blocked" | "not_found" | "no_such_domain" | "http_error" | "unreachable" | "timeout" | "not_html" | "too_many_redirects", message: string, public status?: number) {
    super(message);
  }
}

// ─── Fetch (10s timeout, 1MB cap, 3 redirects, HTML only) ───────────────
// Browser-compatible prefix so CDNs serve the normal page; the bot token and
// URL let site owners identify (and contact) us in their logs.
const USER_AGENT = "Mozilla/5.0 (compatible; OlmeneBot/1.0; +https://olmene.com)";
// Modern sites inline megabytes of framework JSON. Read at most this much and
// audit what we have (head + start of body) instead of refusing the site:
// a hard 1 MB cap rejected ~30% of real homepages (Linear, Cal.com, Framer…).
const MAX_BYTES = 4 * 1024 * 1024;

async function fetchPage(rawUrl: URL, timeoutMs = 10_000): Promise<{ url: string; html: string; bytes: number }> {
  let fetched: { res: Response; url: URL };
  try {
    fetched = await safeFetch(rawUrl, {
      cache: "no-store", // an audit must read the page as it is right now — never a cached copy
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
    }, timeoutMs);
  } catch (e) {
    if (e instanceof TargetRejected || e instanceof ScanError) throw e;
    const name = (e as Error)?.name ?? "";
    if (name === "AbortError" || /abort|timed? ?out/i.test(String((e as Error)?.message))) throw new ScanError("timeout", "timed out");
    throw new ScanError("unreachable", "connection failed");
  }
  const { res, url } = fetched;
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 503) {
      throw new ScanError("blocked", `HTTP ${res.status}`, res.status);
    }
    if (res.status === 404 || res.status === 410) throw new ScanError("not_found", `HTTP ${res.status}`, res.status);
    throw new ScanError("http_error", `HTTP ${res.status}`, res.status);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    await res.body?.cancel().catch(() => {});
    throw new ScanError("not_html", contentType.split(";")[0] || "unknown type");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new ScanError("unreachable", "empty body");
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const room = MAX_BYTES - received;
      const part = value.byteLength > room ? value.slice(0, room) : value; // keep what fits, even from one huge chunk
      chunks.push(part);
      received += part.byteLength;
      if (received >= MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break; // truncate: the audit reads head + the first MAX_BYTES of the page
      }
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { url: url.toString(), html: new TextDecoder("utf-8", { fatal: false }).decode(out), bytes: received };
}

async function fetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const { res } = await safeFetch(new URL(url), { method: "GET", cache: "no-store", headers: { "User-Agent": USER_AGENT } }, timeoutMs);
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    return (await res.text()).slice(0, 200_000);
  } catch {
    return null;
  }
}

/**
 * robots.txt + sitemap discovery. Sites often declare their sitemap in
 * robots.txt (Stripe: /sitemap/sitemap.xml, Astro: /sitemap-index.xml), so
 * checking only /sitemap.xml produced false "crawlability gap" findings.
 */
async function discoverCrawlFiles(origin: string): Promise<{ robotsTxtOk: boolean; sitemapXmlOk: boolean; sitemapUrl: string | null; robotsTxt: string | null }> {
  const robots = await fetchText(`${origin}/robots.txt`);
  const declared = robots
    ? [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => {
      try { return new URL(m[1], origin).toString(); } catch { return null; }
    }).filter((u): u is string => !!u)
    : [];
  const candidates = [...declared.slice(0, 3), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
  for (const u of candidates) {
    if (await probeOk(u)) return { robotsTxtOk: robots !== null, sitemapXmlOk: true, sitemapUrl: u, robotsTxt: robots };
  }
  return { robotsTxtOk: robots !== null, sitemapXmlOk: false, sitemapUrl: null, robotsTxt: robots };
}

async function probeOk(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    // Sitemap URLs come from robots.txt and can point anywhere: same guard as the page.
    const { res } = await safeFetch(new URL(url), { method: "GET", cache: "no-store", headers: { "User-Agent": USER_AGENT } }, timeoutMs);
    await res.body?.cancel().catch(() => {});
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Deterministic signals (same checks as full reports) ────────────────
// Calls to action, matched on WORD boundaries (substring matching counted
// "poetry"/"telemetry" as "try" and "unsubscribe" as "subscribe").
const CTA_PATTERN = new RegExp(
  "(?<![\\p{L}\\p{N}])(" + [
    "get started", "start (?:for )?free", "start (?:your|a) free", "start (?:now|today|trial|selling|building|fixing|writing|creating)",
    "try (?:it )?(?:for )?free", "try [a-z0-9]+", "sign ?up", "create (?:a |your )?(?:free )?account",
    "book (?:a )?(?:demo|call|meeting)", "(?:request|get|schedule) (?:a )?demo", "get [a-z0-9]+ (?:for )?free",
    "buy(?: now)?", "shop(?: now| the| all)?", "order(?: now)?", "purchase", "subscribe", "free trial",
    "talk to (?:sales|us|an expert)", "contact (?:us|sales)", "get in touch", "download", "install",
    "join(?: now| free| the waitlist| us)?", "get (?:early )?access", "request access", "scan", "get (?:the )?app",
    "add to cart", "reserve", "donate", "apply(?: now)?",
    // German, French, Spanish, Portuguese, Italian, Greek
    "jetzt [\\p{L}]+", "kostenlos (?:testen|starten|registrieren)", "registrieren", "anmelden", "abonnieren", "kaufen", "bestellen", "in den warenkorb",
    "s[’']abonner", "s[’']inscrire", "essayer", "commencer", "acheter", "commander", "réserver", "nous contacter", "créer un compte",
    "comprar", "empezar", "empieza", "prueba(?:lo)? gratis", "regístrate", "suscríbete", "reservar", "contactar",
    "começar", "experimente", "assine", "inscreva-se", "acquista", "inizia", "prova gratis", "iscriviti", "abbonati",
    "εγγραφή", "αγορά", "ξεκινήστε", "δοκιμάστε", "κάντε κράτηση",
    // Booking intents (local services, marketplaces)
    "book now", "book (?:an |a )?(?:appointment|table|consultation)", "prendre rendez-vous", "termin (?:buchen|vereinbaren)", "pedir cita", "reservar cita", "prenota(?: ora)?",
    // Dutch, Polish, Turkish
    "probeer (?:het )?gratis", "aanmelden", "bestel(?:len)?", "kopen", "zarejestruj(?: się)?", "wypróbuj", "kup(?: teraz)?", "ücretsiz dene", "kaydol", "satın al",
    "essai gratuit", "empieza gratis", "comienza gratis", "agendar", "teste grátis",
  ].join("|") + ")(?![\\p{L}\\p{N}])",
  "iu",
);

// Trust signals, word-bounded, with simple negation handling ("no testimonials
// yet" is not a testimonial). "rated" alone matched "generated"/"integrated".
const TRUST_PATTERNS: Array<[string, RegExp]> = [
  ["testimonials", /\btestimonials?\b/],
  // Plural or customer-qualified only: "you review and merge" is a verb, not proof.
  ["reviews", /\b(?:\d[\d,.]*\+? )?(?:customer |user |verified )?reviews\b(?! policy)|\b(?:customer|user|verified) review\b/],
  ["case studies", /\bcase stud(?:y|ies)\b/],
  ["our customers", /\bour customers\b/],
  ["trusted by", /\btrusted by\b/],
  ["as seen in", /\bas (?:seen|featured) (?:in|on)\b/],
  ["guarantee", /\b(?:money[- ]back )?guarantee[ds]?\b/],
  ["secure checkout", /\bsecure (?:checkout|payments?)\b/],
  ["GDPR", /\bgdpr\b/],
  ["SOC 2", /\bsoc ?2\b/],
  ["ISO 27001", /\biso ?27001\b/],
  ["star rating", /\b[1-5](?:[.,]\d)? ?(?:\/ ?5|out of 5|stars?)\b|★{3,}|\b5-star\b|\brated [1-5]/],
  ["customer stories", /\b(?:customer|success) stories\b|\bwall of love\b|\bwhat (?:our )?(?:customers|users|clients|people) (?:say|are saying)\b/],
  ["used by", /\b(?:used|loved|chosen|relied on|backed) by\b/],
  ["customer count", /\b\d[\d,.]*\s?(?:k|m|million|thousand)?\+?\s(?:teams|companies|customers|users|businesses|creators|developers|organi[sz]ations|brands|merchants|writers|entrepreneurs|clients|members|subscribers)\b/],
  ["review sites", /\b(?:g2|capterra|trustpilot|product hunt|app store rating)\b/],
  ["easy returns", /\bfree (?:returns|shipping|delivery)\b|\b\d+[- ]day (?:returns|money[- ]back|free trial)\b/],
  ["test winner", /\btest winner\b|\bbest (?:rated|reviewed)\b|\baward[- ]winning\b/],
  ["awards", /\beditor['’]s choice\b|\bapp of the (?:year|day)\b|\bdesign awards?\b|\bwinner of\b/],
  // Non-English proof (word-bounded on letters in any script)
  ["reviews", /(?<![\p{L}\p{N}])(?:kundenstimmen|bewertungen|erfahrungsberichte|opiniones|reseñas|valoraciones|testimonios|avis clients|témoignages|recensioni|testimonianze|depoimentos|avaliações|beoordelingen|klantervaringen|opinie klientów|κριτικές|μαρτυρίες|yorumlar|отзывы)(?![\p{L}\p{N}])/u],
  ["test winner", /(?<![\p{L}\p{N}])(?:testsieger|stiftung warentest|ganador de la prueba)(?![\p{L}\p{N}])/u],
  ["trusted by", /(?<![\p{L}\p{N}])(?:kunden vertrauen|vertrauen uns|confían en|ils nous font confiance|font confiance à|si fidano di|confiam (?:na|em)|vertrouwen ons|μας εμπιστεύονται)(?![\p{L}\p{N}])/u],
  ["case studies", /(?<![\p{L}\p{N}])(?:fallstudien|referenzen|casos de éxito|études de cas|casi di successo|casos de sucesso|klantverhalen)(?![\p{L}\p{N}])/u],
  ["guarantee", /(?<![\p{L}\p{N}])(?:geld-zurück-garantie|garantía|satisfait ou remboursé|garanzia|garantia|εγγύηση)(?![\p{L}\p{N}])/u],
  ["customer count", /\b\d[\d.,]*\s?(?:k|mil|tsd\.?|millionen|millones|millions?)?\+?\s(?:kunden|unternehmen|clientes|empresas|clients|entreprises|clienti|aziende|klanten|πελάτες)(?![\p{L}\p{N}])/u],
];
// Negation anywhere earlier in the same sentence ("no visible testimonials,
// logos, or case studies" negates all three).
const NEGATION = /\b(?:no|without|zero|lacks?|lack of|missing|not yet any|none)\b/;

function findTrustSignals(lowText: string): string[] {
  const found: string[] = [];
  for (const [label, re] of TRUST_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(lowText))) {
      const ctx = lowText.slice(Math.max(0, m.index - 80), m.index);
      const sentence = ctx.slice(Math.max(ctx.lastIndexOf(". "), ctx.lastIndexOf("! "), ctx.lastIndexOf("? ")) + 1);
      if (!NEGATION.test(sentence)) { if (!found.includes(label)) found.push(label); break; }
    }
  }
  return found;
}

/** Element text with spaces between nested blocks ("Sign Up" + "Create…" not "Sign UpCreate…"). */
function spacedText($: cheerio.CheerioAPI, el: unknown): string {
  const parts: string[] = [];
  const walk = (node: { type?: string; data?: string; children?: unknown[] }) => {
    if (node.type === "text" && node.data) parts.push(node.data);
    for (const c of node.children ?? []) walk(c as typeof node);
  };
  walk(el as { children?: unknown[] });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

interface Check { check: string; status: "pass" | "warn" | "fail"; detail: string }
interface Signals {
  pageUrl: string; titleText: string | null; titleLength: number | null;
  metaDescription: string | null; metaDescriptionLength: number | null;
  h1Count: number; h1Texts: string[]; headingOutline: string[];
  canonical: string | null; lang: string | null; viewport: boolean;
  openGraph: boolean; ogImage: boolean; favicon: boolean; https: boolean;
  twitterCard: boolean; jsonLdTypes: string[];
  imagesWithoutAlt: number; imagesTotal: number; internalLinks: number; externalLinks: number;
  wordCount: number; hasPricingPage: boolean; ctaButtons: string[]; trustSignals: string[];
  /** How pricing was found: a pricing link, prices on the homepage, or an online store's product prices. */
  pricingEvidence: "link" | "homepage" | "store" | null; isStore: boolean;
  robotsMeta: string | null; robotsTxtOk: boolean; sitemapXmlOk: boolean; sitemapUrl: string | null; checklist: Check[];
}

// Pricing links in the languages Olmene serves (href or link text).
const PRICING_HREF = /pric|plans?\b|preis|tarif|precio|prezz|pre[cç]o|prijs|priser|hinnat|cennik|cenik|fiyat|τιμ|цен|тариф|料金|価格|价格|定价|요금|harga|qiymet/;
const PRICING_TEXT = /(?<![\p{L}\p{N}])(?:pricing|prices|plans(?: (?:&|and) pricing)?|preise|tarife|tarifs|prix|precios|tarifas|planes|prezzi|piani|preços|planos|prijzen|priser|hinnat|cennik|ceny|fiyatlar|fiyatlandırma|τιμές|τιμολόγηση|цены|тарифы|料金|価格|价格|定价|요금제|harga)(?![\p{L}\p{N}])/u;

function computeSeoSignals(
  html: string,
  pageUrl: string,
  extras: { robotsTxtOk: boolean; sitemapXmlOk: boolean; sitemapUrl?: string | null; faviconIcoOk?: boolean },
): Signals {
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
  // Structural social proof, counted before stripping: quote blocks and logo walls.
  // Quote markup always counts; class-name matches ("quote", "review-card"…)
  // need real text so a "quote-button" or empty widget shell does not.
  const quoteBlocks = $("blockquote, q").length +
    $("[class*=testimonial], [class*=Testimonial], [class*=review-card], [class*=ReviewCard], [class*=quote], [class*=Quote], [class*=kudos]")
      .not("blockquote, q")
      .filter((_, el) => !$(el).find("blockquote, q").length && $(el).text().replace(/\s+/g, " ").trim().length >= 40).length;
  // Online-store markers (platform code + product structured data). Stores show
  // prices on products, so "no pricing page" is not a finding for them.
  const rawLow = html.slice(0, 2_000_000).toLowerCase();
  const storePlatform = /cdn\.shopify\.com|window\.shopify|shopify\.theme|woocommerce|wc-add-to-cart|bigcommerce|magento|prestashop|shopware|ecwid|squarespace-commerce/.test(rawLow);
  const logoImages = $("img").filter((_, el) => /\blogo\b/i.test($(el).attr("alt") ?? "")).length;
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
  const ogImage = !!$('meta[property="og:image"]').attr("content");
  // Browsers request /favicon.ico even without a <link>, so that counts too.
  const favicon = !!$('link[rel~="icon"]').attr("href") || !!extras.faviconIcoOk;
  const https = pageUrl.startsWith("https://");
  const twitterCard = !!($('meta[name^="twitter:"]').attr("content") || $('meta[property^="twitter:"]').attr("content"));
  let imagesTotal = 0, imagesWithoutAlt = 0;
  // alt="" is the correct markup for decorative images (WCAG H67), so only a
  // MISSING alt attribute counts. 1x1 tracking pixels are not images.
  $("img").each((_, el) => {
    const w = Number($(el).attr("width")), h = Number($(el).attr("height"));
    if (w && h && w <= 2 && h <= 2) return;
    imagesTotal++;
    if ($(el).attr("alt") === undefined) imagesWithoutAlt++;
  });
  let pageOrigin = "";
  try { pageOrigin = new URL(pageUrl).origin; } catch { /* ignore */ }
  let internalLinks = 0, externalLinks = 0, hasPricingPage = false, productLinks = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const low = href.toLowerCase();
    if (PRICING_HREF.test(low) || PRICING_TEXT.test(spacedText($, el).toLowerCase())) hasPricingPage = true;
    if (/\/(?:products?|collections|shop|store|p)\/[^/?#]+/.test(low)) productLinks++;
    try {
      const u = new URL(href, pageUrl);
      if (u.origin === pageOrigin) internalLinks++;
      else externalLinks++;
    } catch { /* ignore */ }
  });
  // Social proof usually sits below the fold: read the whole page text (capped
  // for safety), not just the first 12k characters as before.
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300_000);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const ctaButtons: string[] = [];
  const addCta = (t: string) => {
    if (t && !ctaButtons.includes(t) && ctaButtons.length < 8) ctaButtons.push(t);
  };
  // A lead-capture form (email/URL/text field + submit) is a CTA whatever its
  // label says ("Scan my site", "Analyze"), as long as it isn't site search.
  $("form").each((_, form) => {
    const f = $(form);
    if (f.attr("role") === "search" || f.find('input[type="search"], input[name="q"], input[name="s"]').length) return;
    if (!f.find('input[type="email"], input[type="url"], input[type="text"], input[type="tel"], input:not([type])').length) return;
    const submit = f.find('button[type="submit"], button:not([type]), input[type="submit"]').first();
    if (!submit.length) return;
    const label = spacedText($, submit.get(0)) || submit.attr("value")?.trim() || "";
    addCta(/\p{L}/u.test(label) ? label : "Signup form");
  });
  $("a, button, [role=button], input[type=submit]").each((_, el) => {
    const t = spacedText($, el) || $(el).attr("value")?.trim() || "";
    if (!t || t.length > 40) return;
    if (CTA_PATTERN.test(t)) addCta(t);
  });
  const lowText = text.toLowerCase();
  // Prices in the page text: "$20.00", "€49 / month", "12,90 €", "USD 15".
  const priceMatches = lowText.match(/(?:[$€£¥₹]\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:€|£|zł|kr|usd|eur|gbp)\b|\b(?:usd|eur|gbp)\s?\d{1,5})/g) ?? [];
  const pricePerPeriod = /(?:[$€£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|£|usd|eur))\s?(?:\/|per|a|pro|al|par|por|al mese|\/ ?mo)\s?(?:month|mo|year|yr|monat|jahr|mes|año|mois|an|mese|anno|mês|ano|user|seat)\b/.test(lowText);
  const cartLike = /add to (?:cart|bag)|in den warenkorb|añadir al carrito|ajouter au panier|aggiungi al carrello|adicionar ao carrinho|in winkelwagen/.test(lowText);
  // Offers also describe software plans (SoftwareApplication.offers), so on
  // their own they only mark a shop when the page isn't software.
  const softwareSchema = jsonLdTypes.some((t) => /^(?:SoftwareApplication|WebApplication|MobileApplication)$/i.test(t));
  const productSchema = jsonLdTypes.some((t) => /^(?:Product|OnlineStore|Store|ProductGroup)$/i.test(t)) || (!softwareSchema && jsonLdTypes.some((t) => /^(?:Offer|AggregateOffer)$/i.test(t)));
  const isStore = storePlatform || productSchema || (priceMatches.length >= 4 && (cartLike || productLinks >= 3)) || priceMatches.length >= 10;
  const pricingEvidence: "link" | "homepage" | "store" | null = hasPricingPage ? "link" : isStore && priceMatches.length > 0 ? "store" : pricePerPeriod ? "homepage" : null;
  if (pricingEvidence) hasPricingPage = true;
  if (ctaButtons.length === 0 && isStore && productLinks >= 3) addCta("Product links");
  const trustSignals = findTrustSignals(lowText);
  // Testimonials without quote markup: a quoted sentence right before a person's
  // name ("…shift to Buttondown." Jeremy Singer-Vine). Two or more count.
  const attributedQuotes = (text.match(/["“„«]([^"“”„«»]{30,400})["”“»]\s*[—–-]?\s*\p{Lu}[\p{Ll}'’]+(?:[ -]\p{Lu}[\p{Ll}'’]+){1,3}/gu) ?? [])
    .filter((q) => q.split(/\s+/).length >= 8).length;
  if ((quoteBlocks >= 2 || attributedQuotes >= 2) && !trustSignals.includes("customer quotes")) trustSignals.push("customer quotes");
  if (logoImages >= 5) trustSignals.push("customer logos");
  const robotsMeta = $('meta[name="robots"]').attr("content")?.trim() || null;

  const s = {
    pageUrl, titleText, titleLength, metaDescription,
    metaDescriptionLength: metaDescription ? metaDescription.length : null,
    h1Count: h1s.length, h1Texts: h1s.slice(0, 5), headingOutline,
    canonical, lang, viewport, openGraph, ogImage, favicon, https, twitterCard, jsonLdTypes,
    imagesWithoutAlt, imagesTotal, internalLinks, externalLinks, wordCount,
    hasPricingPage, pricingEvidence, isStore, ctaButtons, trustSignals, robotsMeta,
    robotsTxtOk: extras.robotsTxtOk, sitemapXmlOk: extras.sitemapXmlOk, sitemapUrl: extras.sitemapUrl ?? null,
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
  push("Social preview image (og:image)", s.ogImage ? "pass" : "warn", s.ogImage ? "og:image present" : "No og:image — link previews render without an image");
  push("Favicon", s.favicon ? "pass" : "warn", s.favicon ? "icon link present" : "No favicon link found (looks unfinished in browser tabs)");
  push("HTTPS", s.https ? "pass" : "fail", s.https ? "Page served over HTTPS" : "Page served over plain http — browsers flag it as not secure");
  push("Twitter card", s.twitterCard ? "pass" : "warn", s.twitterCard ? "twitter: meta present" : "No twitter: tags");
  push("Structured data (JSON-LD)", s.jsonLdTypes.length ? "pass" : "warn", s.jsonLdTypes.length ? `@type: ${s.jsonLdTypes.join(", ")}` : "No JSON-LD found");
  push("Image alt coverage", s.imagesTotal === 0 ? "warn" : s.imagesWithoutAlt / s.imagesTotal <= 0.1 ? "pass" : s.imagesWithoutAlt / s.imagesTotal <= 0.5 ? "warn" : "fail",
    s.imagesTotal === 0 ? "No images found on the homepage" : `${s.imagesWithoutAlt} of ${s.imagesTotal} images have no alt attribute (alt="" for decorative images is fine)`);
  push("Content depth", s.wordCount >= 300 ? "pass" : s.wordCount >= 100 ? "warn" : "fail", `~${s.wordCount} words of body text (aim for 300+)`);
  push("Pricing page", s.hasPricingPage ? "pass" : "warn",
    s.pricingEvidence === "store" ? "Online store: prices are shown on the products"
      : s.pricingEvidence === "homepage" ? "Prices are shown on the homepage"
      : s.hasPricingPage ? "Pricing page linked from the homepage" : "No pricing link or prices found on the homepage");
  push("Call-to-action", s.ctaButtons.length ? "pass" : "fail", s.ctaButtons.length ? `Found: ${s.ctaButtons.slice(0, 4).join(" | ")}` : "No clear CTA button/link detected");
  push("Trust signals", s.trustSignals.length >= 2 ? "pass" : s.trustSignals.length === 1 ? "warn" : "fail",
    s.trustSignals.length ? `Found: ${s.trustSignals.slice(0, 4).join(", ")}` : "No testimonials/reviews/guarantees detected");
  const noindex = !!s.robotsMeta && /noindex/i.test(s.robotsMeta);
  push("Robots meta", noindex ? "fail" : "pass", noindex ? "Page is set to noindex!" : s.robotsMeta ? `robots: ${s.robotsMeta}` : "No restrictions");
  push("/robots.txt", s.robotsTxtOk ? "pass" : "warn", s.robotsTxtOk ? "Reachable (200)" : "Not reachable");
  push("/sitemap.xml", s.sitemapXmlOk ? "pass" : "warn", s.sitemapXmlOk ? `Reachable (${s.sitemapUrl ? new URL(s.sitemapUrl).pathname : "200"})` : "No sitemap at /sitemap.xml or declared in robots.txt");
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
  impact?: string; // short label, e.g. "conversion friction" (attached after buildFindings)
  impactHypothesis?: string; // business implication, labelled as hypothesis in the UI
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
  if (!s.hasPricingPage) f.push({ title: "Pricing is hidden from the homepage", severity: "high", evidence: "No pricing link and no prices were found on your homepage.", whatToChange: "Link your pricing page from the header or hero \u2014 hidden pricing is one of the top reasons qualified visitors leave." });
  if (s.trustSignals.length === 0) f.push({ title: "No visible trust signals", severity: "high", evidence: "No testimonials, reviews, guarantees or customer references were detected on the homepage.", whatToChange: "Add a short proof strip under the hero: 2\u20133 customer quotes, a rating, or recognizable logos." });
  else if (s.trustSignals.length === 1) f.push({ title: "Thin trust signals", severity: "medium", evidence: `Only one trust signal found (${s.trustSignals[0]}).`, whatToChange: "Combine reviews, a guarantee and named customers \u2014 one signal alone rarely convinces." });
  if (s.metaDescription === null) f.push({ title: "Missing meta description", severity: "medium", evidence: "Your homepage has no meta description \u2014 search engines improvise your snippet.", whatToChange: "Write a 120\u2013160 character description with your value proposition and a reason to click." });
  else if (s.metaDescriptionLength! < 50) f.push({ title: "Meta description is too short", severity: "medium", evidence: `${s.metaDescriptionLength} characters \u2014 search engines may rewrite it.`, whatToChange: "Extend it to 120\u2013160 characters: what you sell, for whom, and why it beats the alternative." });
  if (s.wordCount < 300) f.push({ title: "Homepage has very little content", severity: s.wordCount < 100 ? "high" : "medium", evidence: `~${s.wordCount} words of readable text on the homepage.`, whatToChange: "Aim for 300+ words: explain the problem you solve, for whom, and how \u2014 it feeds both SEO and persuasion." });
  if (s.imagesTotal > 0 && s.imagesWithoutAlt / s.imagesTotal > 0.5) f.push({ title: "Images are invisible to search engines", severity: "medium", evidence: `${s.imagesWithoutAlt} of ${s.imagesTotal} images have no alt attribute at all.`, whatToChange: "Describe each image in one short sentence \u2014 it's free SEO and accessibility." });
  if (s.jsonLdTypes.length === 0) f.push({ title: "No structured data (JSON-LD)", severity: "medium", evidence: "Your homepage has no schema.org markup.", whatToChange: "Add Organization/Product JSON-LD so search engines can build rich results for your brand." });
  if (!s.openGraph) f.push({ title: "Weak social previews", severity: "medium", evidence: "Few or no og: meta tags found \u2014 shared links look bare.", whatToChange: "Add og:title, og:description and og:image so your links preview properly everywhere." });
  if (!s.robotsTxtOk || !s.sitemapXmlOk) f.push({ title: "Crawlability gaps", severity: "medium", evidence: `robots.txt ${s.robotsTxtOk ? "OK" : "missing/unreachable"}, sitemap.xml ${s.sitemapXmlOk ? "OK" : "missing/unreachable"}.`, whatToChange: "Publish a sitemap.xml and reference it from robots.txt so every key page gets indexed." });
  // Checklist warns above 60 chars; a headline finding only when clearly off
  // (Google truncates long titles rather than penalising them).
  if (s.titleLength !== null && (s.titleLength < 10 || s.titleLength > 70)) f.push({ title: "Title tag length is off", severity: "medium", evidence: `\u201c${s.titleText}\u201d is ${s.titleLength} characters (aim 10\u201360).`, whatToChange: "Rewrite the title as: product \u2014 primary benefit \u2014 brand, under 60 characters." });
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

// ─── Failure messages (stable codes for the UI; never internal details) ──
function scanFailure(e: unknown): { code: string; message: string; status?: number } {
  if (e instanceof TargetRejected) {
    return { code: "forbidden_target", message: "That address can't be scanned. Olmene only reads public websites." };
  }
  if (e instanceof ScanError) {
    switch (e.code) {
      case "blocked":
        return {
          code: "site_blocked",
          status: e.status,
          message: `This site blocks automated visitors (it answered HTTP ${e.status}), so Olmene couldn't read it. Your URL is fine; the site's bot protection stopped the scan.`,
        };
      case "not_found":
        return { code: "site_not_found", status: e.status, message: `That page doesn't exist (HTTP ${e.status}). Check the URL.` };
      case "no_such_domain":
        return { code: "domain_not_found", message: "We couldn't find that domain. Check the spelling and try again." };
      case "http_error":
        return { code: "site_error", status: e.status, message: `The site answered with an error (HTTP ${e.status}). Try again in a moment.` };
      case "timeout":
        return { code: "timeout", message: "The site took longer than 10 seconds to respond. Try again in a moment." };
      case "not_html":
        return { code: "not_html", message: `That URL isn't a web page (it returned ${e.message}). Enter your homepage address.` };
      case "too_many_redirects":
        return { code: "too_many_redirects", message: "That URL redirects too many times. Enter the final address of your homepage." };
      default:
        return { code: "unreachable", message: "We couldn't reach that site. Check the URL and that the site is online." };
    }
  }
  return { code: "fetch_failed", message: "We couldn't read that site. Check the URL and try again." };
}

// ─── JavaScript shells ───────────────────────────────────────────────────
/** Head/technical facts from the raw HTML (what social and AI crawlers see), content from the rendered page. */
function mergeRendered(raw: Signals, rendered: Signals): Signals {
  const merged = { ...raw } as Signals & Record<string, unknown>;
  for (const k of CONTENT_FIELDS) (merged as Record<string, unknown>)[k] = (rendered as unknown as Record<string, unknown>)[k];
  merged.checklist = buildChecklist(merged);
  return merged;
}

/** Content checks on an unrendered shell are "not measured", never failures. */
function markContentUnmeasured(s: Signals): Signals {
  const checklist = s.checklist.map((c) =>
    CONTENT_CHECKS.includes(c.check)
      ? { ...c, status: "warn" as const, detail: "Not measured: the page is built with JavaScript and its HTML has no content yet" }
      : c,
  );
  return { ...s, checklist };
}

// ─── Saved scans ─────────────────────────────────────────────────────────
const SCAN_CACHE_MS = 10 * 60_000;
const ANON_SCAN_DAYS = 30;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Visible text for the planner (server-only, never returned by this API). */
function pageTextOf(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, template").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
}

// One request's SSRF-safe fetch for the extra checks: redirect "manual"
// means a single validated hop (redirect checks), otherwise follow safely.
const extraFetch: SafeFetch = async (u, init, timeoutMs) => {
  const url = new URL(u);
  if (init.redirect === "manual") {
    await assertSafeTarget(url);
    return await fetch(url.toString(), { ...init, headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  }
  const { res } = await safeFetch(url, { ...init, headers: { "User-Agent": USER_AGENT } }, timeoutMs);
  return res;
};

// ─── Main ────────────────────────────────────────────────────────────────
const RATE_LIMIT = 8; // per IP per hour
const supabase = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
type Db = ReturnType<typeof supabase>;

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function cronAuthorized(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret.length < 16 || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOT_BUCKET = "scan-shots";

/** Finish work after the response (Supabase edge runtime), or just let it run. */
function background(p: Promise<unknown>): void {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const safe = p.catch(() => {});
  if (rt?.waitUntil) rt.waitUntil(safe);
}

/** A saved scan as the API returns it: the result plus its screenshot and proposals when ready. */
function savedScanBody(row: { id: string; result: unknown; created_at: string; shot?: unknown; proposals?: unknown }): Record<string, unknown> {
  return {
    ...(row.result as Record<string, unknown>),
    ...(row.shot ? { shot: row.shot } : {}),
    ...(row.proposals ? { proposals: row.proposals } : {}),
    scanId: row.id,
    savedAt: row.created_at,
  };
}

type Emit = (event: Record<string, unknown>) => void;

interface ScanContext {
  db: Db;
  url: URL;
  internal: boolean;
  ip: string;
  ipHash: string;
  siteId: string | null;
  userId: string | null;
  emit?: Emit;
}

type ScanOutcome =
  | { ok: true; result: Record<string, unknown>; scanId: string | null; shotJob: (() => Promise<Shot>) | null }
  | { ok: false; status: number; error: { code: string; message: string; status?: number } };

/** Upload a screenshot to the public scan-shots bucket; its URL or null. */
async function storeShot(db: Db, scanId: string, jpeg: Uint8Array): Promise<string | null> {
  const path = `${new Date().toISOString().slice(0, 10)}/${scanId}.jpg`;
  try {
    const { error } = await db.storage.from(SHOT_BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
    if (error) return null;
    return db.storage.from(SHOT_BUCKET).getPublicUrl(path).data.publicUrl ?? null;
  } catch {
    return null;
  }
}

async function runScan(ctx: ScanContext): Promise<ScanOutcome> {
  const { db, url, internal, emit } = ctx;
  let home: { url: string; html: string; bytes: number };
  try {
    home = await fetchPage(url);
  } catch (e) {
    return { ok: false, status: 422, error: scanFailure(e) };
  }
  const platform = detectPlatform(home.html);
  emit?.({ type: "page", siteUrl: home.url, platform });

  const origin = new URL(home.url).origin;
  const [crawl, faviconIcoOk] = await Promise.all([
    discoverCrawlFiles(origin),
    probeOk(`${origin}/favicon.ico`),
  ]);
  const crawlExtras = { ...crawl, faviconIcoOk };
  let signals = computeSeoSignals(home.html, home.url, crawlExtras);

  // JavaScript-built page: render it, or say its content wasn't measured.
  let contentMeasured = true;
  let rendered = false;
  let contentHtml = home.html;
  const shell = looksLikeJsShell(home.html, signals.wordCount);
  const extrasPromise = runExtraChecks({
    pageUrl: home.url, html: home.html, htmlBytes: home.bytes, robotsTxt: crawl.robotsTxt, fetch: extraFetch,
    cruxKey: Deno.env.get("CRUX_API_KEY") ?? null,
    onCheck: emit ? (check) => emit({ type: "extra", check }) : undefined,
  });
  if (shell) {
    emit?.({ type: "rendering" });
    const r = await renderPage(home.url);
    if (r) {
      rendered = true;
      contentHtml = r.html;
      signals = mergeRendered(signals, computeSeoSignals(r.html, home.url, crawlExtras));
      await recordUsage(db, { kind: "render", source: internal ? "monitor" : "scan", units: r.ms / 1000, latency_ms: r.ms, step: "free-audit" });
      if (signals.wordCount < 25) contentMeasured = false; // rendered but still empty (blocked, login wall)
    } else {
      contentMeasured = false;
    }
    if (!contentMeasured) signals = markContentUnmeasured(signals);
  }
  emit?.({ type: "checklist", checklist: signals.checklist });

  let findings = buildFindings(signals).sort((a, b) => ({ critical: 0, high: 1, medium: 2 })[a.severity] - ({ critical: 0, high: 1, medium: 2 })[b.severity]);
  if (!contentMeasured) findings = findings.filter((f) => !CONTENT_FINDINGS.includes(f.title));
  // Attach the labelled business-impact hypothesis to each deterministic finding.
  for (const finding of findings) {
    const h = IMPACT_HYPOTHESES[finding.title] ?? { impact: "growth friction", impactHypothesis: "Left unfixed, this likely slows some visitors on their way to becoming customers." };
    finding.impact = h.impact;
    finding.impactHypothesis = h.impactHypothesis;
  }
  const highImpactCount = findings.filter((x) => x.severity === "critical" || x.severity === "high").length;
  const scores = subScores(signals);
  if (!contentMeasured) {
    // Unmeasured content counts as neutral, not as a failure.
    scores.messaging = 50;
    scores.conversion = 50;
    scores.overall = Math.round(scores.seo * 0.4 + 50 * 0.6);
  }
  emit?.({ type: "scores", scores });
  const opportunity = contentMeasured
    ? biggestOpportunity(signals)
    : { title: "Make your homepage readable without JavaScript", why: "Your page's HTML is an empty app shell until JavaScript runs. Search engines render it late and many AI assistants and link previews never do. Server-rendering or prerendering the homepage lets them read your headline, offer and calls to action." };
  const passed = signals.checklist.filter((c) => c.status === "pass").length;

  // Kind of business + the checks that matter for it (unscored), and the
  // data a search result and a link card are drawn from.
  const business = analyzeBusiness({
    html: contentHtml, pageUrl: home.url, jsonLdTypes: signals.jsonLdTypes, isStore: signals.isStore,
    hasPricingPage: signals.hasPricingPage, ctaButtons: signals.ctaButtons, trustSignals: signals.trustSignals,
  });
  const preview = previewData(home.html, home.url, faviconIcoOk);
  emit?.({ type: "category", category: business.category });
  const extras = [...(await extrasPromise), ...(contentMeasured ? business.checks : [])];
  if (emit && contentMeasured) for (const check of business.checks) emit({ type: "extra", check });

  // Record the audit (rate limiting) — must be awaited so the row persists.
  if (!internal) await db.from("free_audits").insert({ ip: ctx.ip, url: home.url.slice(0, 2048) }).then(() => {}, () => {});
  // Opportunistic prune of day-old rows (1% of requests).
  if (Math.random() < 0.01) {
    await db.from("free_audits").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString()).then(() => {}, () => {});
  }

  const shotPossible = !internal && renderingConfigured();
  const result: Record<string, unknown> = {
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
    contentMeasured,
    rendered,
    platform,
    category: business.category,
    extras,
    preview,
    shot: { status: shotPossible ? "pending" : "unavailable" } satisfies Shot,
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
      metaDescription: signals.metaDescription,
      hasStructuredData: signals.jsonLdTypes.length > 0,
      hasPricingPage: signals.hasPricingPage,
      lang: signals.lang,
      appStoreId: business.appStoreId,
      phoneLinks: business.phoneLinks,
    },
  };

  // Save it: share links, carrying the scan through sign-in, free fix
  // previews and monitoring. A failed save still returns the result.
  let savedId: string | null = null;
  try {
    const { data: saved } = await db.from("scans").insert({
      site_url: home.url.slice(0, 2048),
      host: new URL(home.url).hostname,
      result,
      page_text: pageTextOf(contentHtml),
      ip_hash: internal ? null : ctx.ipHash,
      source: internal ? "monitor" : "free",
      site_id: internal && ctx.siteId && UUID.test(ctx.siteId) ? ctx.siteId : null,
      user_id: internal && ctx.userId && UUID.test(ctx.userId) ? ctx.userId : null,
      expires_at: internal ? null : new Date(Date.now() + ANON_SCAN_DAYS * 86400_000).toISOString(),
    }).select("id").single();
    savedId = (saved as { id?: string } | null)?.id ?? null;
  } catch { /* table missing or insert failed: the scan still answers */ }

  // "Your site, live": screenshot + pins, after the answer.
  const shotJob = shotPossible && savedId
    ? async (): Promise<Shot> => {
      const cap = await capture(home.url, signals.checklist, signals.ctaButtons).catch(() => null);
      let shot: Shot = { status: "unavailable" };
      if (cap) {
        await recordUsage(db, { kind: "render", source: "scan", units: cap.ms / 1000, latency_ms: cap.ms, step: "free-audit-shot" });
        const publicUrl = await storeShot(db, savedId!, cap.jpeg);
        if (publicUrl) shot = { status: "ready", url: publicUrl, width: SHOT_VIEWPORT.width, height: SHOT_VIEWPORT.height, pins: cap.pins, capturedAt: new Date().toISOString() };
      }
      await db.from("scans").update({ shot }).eq("id", savedId!).then(() => {}, () => {});
      return shot;
    }
    : null;
  return { ok: true, result, scanId: savedId, shotJob };
}

/** "Show me the fix": proposed head fixes for a saved scan, generated once and cached. */
async function proposalsFor(db: Db, scanId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: row } = await db.from("scans").select("id, result, page_text, proposals, expires_at").eq("id", scanId).maybeSingle();
  if (!row || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return { status: 404, body: { error: { code: "scan_not_found", message: "That scan doesn't exist or has expired." } } };
  }
  if (row.proposals) return { status: 200, body: { proposals: row.proposals, cached: true } };
  // deno-lint-ignore no-explicit-any
  const r = row.result as Record<string, any>;
  const input: ProposalInput = {
    siteUrl: r.siteUrl,
    title: r.stats?.title ?? null,
    metaDescription: r.stats?.metaDescription ?? null,
    h1: r.stats?.h1 ?? null,
    lang: r.stats?.lang ?? langFromChecklist(r.checklist ?? []),
    pageText: row.page_text ?? "",
    checklist: r.checklist ?? [],
    hasStructuredData: !!r.stats?.hasStructuredData,
    preview: r.preview ?? null,
    categoryLabel: r.category?.label ?? null,
  };
  const fields = r.contentMeasured === false ? [] : fieldsToRewrite(input);
  let rewritten: Record<string, { after: string; rationale: string }> = {};
  let model: string | null = null;
  if (fields.length && input.pageText.length >= 80) {
    const { system, user } = proposalPrompt(input, fields);
    const answer = await smallJsonCall<Record<string, { after: string; rationale: string }>>(db, {
      step: "scan-proposals", source: "scan", system, user, maxTokens: 600, temperature: 0.3, timeoutMs: 25_000,
      validate: (v) => validateProposal(v, fields),
    });
    if (answer) {
      rewritten = answer.data;
      model = answer.model;
    }
  }
  const proposals = assembleProposals(input, rewritten, model);
  if (!proposals.fields.length && !proposals.tags.length) {
    return { status: 200, body: { proposals, nothingToFix: true } };
  }
  await db.from("scans").update({ proposals }).eq("id", scanId).then(() => {}, () => {});
  return { status: 200, body: { proposals } };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const db = supabase();

  // Read a saved scan back: GET ?id=… or POST {scanId}. The id is an
  // unguessable uuid, so it works as a share link; page text never leaves.
  const getId = req.method === "GET" ? new URL(req.url).searchParams.get("id") : null;
  if (req.method === "GET" && !getId) return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405, cors);
  let body: { url?: string; scanId?: string; siteId?: string; userId?: string; action?: string; stream?: boolean } = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return json({ error: { code: "invalid_body", message: "Expected JSON body." } }, 400, cors);
    }
  }
  const scanId = getId ?? body.scanId ?? null;
  if (scanId) {
    if (!UUID.test(scanId)) return json({ error: { code: "scan_not_found", message: "That scan doesn't exist or has expired." } }, 404, cors);
    if (body.action === "proposals") {
      const out = await proposalsFor(db, scanId);
      return json(out.body, out.status, cors);
    }
    const { data } = await db.from("scans").select("id, result, created_at, expires_at, shot, proposals").eq("id", scanId).maybeSingle();
    if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) {
      return json({ error: { code: "scan_not_found", message: "That scan doesn't exist or has expired." } }, 404, cors);
    }
    return json(savedScanBody(data), 200, cors);
  }
  if (req.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405, cors);

  const url = normalizeSiteUrl(String(body.url ?? ""));
  if (!url) return json({ error: { code: "invalid_url", message: "Enter a valid website URL, e.g. https://example.com" } }, 400, cors);

  // Monitoring (cron secret): no per-IP limit, no cache, linked to a site.
  const internal = cronAuthorized(req);
  const ip = clientIp(req);
  const ipHash = (await sha256Hex(`olmene:${ip}`)).slice(0, 32);
  const wantsStream = body.stream === true || (req.headers.get("accept") ?? "").includes("application/x-ndjson");
  if (!internal) {
    // Same URL scanned in the last 10 minutes: answer from the saved scan
    // (no refetch, no rate-limit charge).
    try {
      const { data: recent } = await db.from("scans").select("id, result, created_at, shot, proposals").eq("site_url", url.toString()).eq("source", "free")
        .gte("created_at", new Date(Date.now() - SCAN_CACHE_MS).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recent) {
        const cachedBody = { ...savedScanBody(recent), cached: true };
        if (!wantsStream) return json(cachedBody, 200, cors);
        return new Response(JSON.stringify({ type: "done", result: cachedBody }) + "\n", { status: 200, headers: { ...cors, "Content-Type": "application/x-ndjson" } });
      }
    } catch { /* cache is best-effort */ }
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    try {
      const { count } = await db.from("free_audits").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo);
      if ((count ?? 0) >= RATE_LIMIT) {
        return json({ error: { code: "rate_limited", message: "You've run several free audits recently. Try again in a little while." } }, 429, cors);
      }
    } catch { /* rate limit best-effort */ }
  }

  const base = { db, url, internal, ip, ipHash, siteId: body.siteId ?? null, userId: body.userId ?? null };

  if (!wantsStream) {
    const out = await runScan(base);
    if (!out.ok) return json({ error: out.error }, out.status, cors);
    if (out.shotJob) background(out.shotJob());
    return json({ ...out.result, scanId: out.scanId }, 200, cors);
  }

  // Streaming scan (NDJSON, one event per line): page → checklist → scores →
  // category → extra checks as they land → done (the full result) → shot.
  // The result is final at "done"; "shot" may follow a few seconds later.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (event) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        emit({ type: "start", url: url.toString() });
        const out = await runScan({ ...base, emit });
        if (!out.ok) {
          emit({ type: "error", error: out.error });
        } else {
          emit({ type: "done", result: { ...out.result, scanId: out.scanId } });
          if (out.shotJob) {
            const job = out.shotJob();
            background(job);
            const shot = await job.catch(() => ({ status: "unavailable" }) as Shot);
            emit({ type: "shot", shot });
          }
        }
      } catch (e) {
        emit({ type: "error", error: { code: "scan_failed", message: "The scan failed unexpectedly. Try again." } });
        console.error(e);
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
});
