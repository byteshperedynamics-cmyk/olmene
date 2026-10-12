/**
 * Free-scan additions that sit beside the 21 scored checks (the score and the
 * "21 checks" copy stay stable):
 *  - detectPlatform: what the site is built with, and whether Olmene's fix
 *    agent can open pull requests for it, so the result can route people to
 *    "fix it" or "get the report" honestly.
 *  - extra checks (not scored): AI-crawler access, llms.txt, http→https,
 *    www/apex consistency, og:image reachable, page weight, render-blocking
 *    scripts, broken homepage links, real-user Core Web Vitals (CrUX).
 * Pure helpers + one runner that receives an SSRF-safe fetch from index.ts.
 */

export interface ExtraCheck {
  id: string;
  group: "AI search" | "Performance" | "Security" | "SEO" | "Social";
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface Platform {
  id: string;
  label: string;
  /** yes: Olmene can open PRs (if the code is on GitHub); partial: head tags only; no: hosted builder. */
  fixable: "yes" | "partial" | "no" | "unknown";
  note: string;
}

// ─── Platform ────────────────────────────────────────────────────────────
export function detectPlatform(html: string): Platform {
  const low = html.slice(0, 600_000).toLowerCase();
  const gen = low.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/)?.[1] ?? "";
  const hosted = (id: string, label: string): Platform => ({
    id, label, fixable: "no",
    note: `${label} sites are edited in ${label}, not in a GitHub repository, so Olmene can't open pull requests. The full report lists every fix to make by hand.`,
  });
  if (/cdn\.shopify\.com|shopify\.theme|window\.shopify/.test(low)) return hosted("shopify", "Shopify");
  if (/wp-content\/|wp-includes\//.test(low) || gen.startsWith("wordpress")) return hosted("wordpress", "WordPress");
  if (/data-wf-site|webflow\.com|assets\.website-files\.com/.test(low) || gen.includes("webflow")) return hosted("webflow", "Webflow");
  if (/static\.wixstatic\.com|_wixcssimports|wix\.com website builder/.test(low) || gen.includes("wix")) return hosted("wix", "Wix");
  if (/squarespace\.com|static1\.squarespace/.test(low) || gen.includes("squarespace")) return hosted("squarespace", "Squarespace");
  if (/framerusercontent\.com|framer\.com\/m\//.test(low) || gen.includes("framer")) return hosted("framer", "Framer");
  if (gen.includes("ghost")) return hosted("ghost", "Ghost");
  if (/self\.__next_f|\/_next\/static\//.test(low)) {
    const pages = low.includes('id="__next_data__"');
    return pages
      ? { id: "nextjs-pages", label: "Next.js (Pages Router)", fixable: "partial", note: "Olmene edits Next.js App Router layouts today; for the Pages Router it can fix files in public/ only." }
      : { id: "nextjs-app", label: "Next.js", fixable: "yes", note: "Olmene can open pull requests for Next.js App Router sites on GitHub." };
  }
  if (/\/_astro\/|astro-island|data-astro-cid/.test(low) || gen.startsWith("astro")) {
    return { id: "astro", label: "Astro", fixable: "yes", note: "Olmene can open pull requests for Astro sites on GitHub." };
  }
  if (/\/_nuxt\//.test(low)) return { id: "nuxt", label: "Nuxt", fixable: "no", note: "Nuxt isn't supported by the fix agent yet. The full report lists every fix." };
  if (/___gatsby/.test(low)) return { id: "gatsby", label: "Gatsby", fixable: "no", note: "Gatsby isn't supported by the fix agent yet. The full report lists every fix." };
  if (gen.startsWith("hugo") || gen.startsWith("jekyll") || gen.startsWith("eleventy")) {
    const label = gen.split(/\s/)[0].replace(/^./, (c) => c.toUpperCase());
    return { id: label.toLowerCase(), label, fixable: "no", note: `${label} templates aren't supported by the fix agent yet. The full report lists every fix.` };
  }
  const viteSpa = /<div[^>]+id=["']root["']/.test(low) && /<script[^>]+type=["']module["'][^>]+src=["'][^"']*\/assets\//.test(low);
  if (viteSpa || /lovable|gptengineer/.test(low)) {
    return { id: "vite-react", label: "React (Vite)", fixable: "partial", note: "Olmene can fix the head of index.html (title, description, social and structured data) in a GitHub repo; page content lives in React components." };
  }
  const bundles = (low.match(/<script\b[^>]*\bsrc=/g) ?? []).length;
  if (bundles <= 3 && !/<div[^>]+id=["'](?:root|app)["']/.test(low)) {
    return { id: "static", label: "Static HTML", fixable: "yes", note: "Olmene can open pull requests for static HTML sites on GitHub." };
  }
  return { id: "unknown", label: "Unknown", fixable: "unknown", note: "Olmene couldn't tell what the site is built with. The fix agent checks your repository when you connect it." };
}

// ─── robots.txt: AI crawlers ─────────────────────────────────────────────
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot"];

/** Bots whose robots.txt group disallows the whole site ("Disallow: /"). */
export function blockedAiCrawlers(robotsTxt: string | null): { blocked: string[]; allBlocked: boolean } {
  if (!robotsTxt) return { blocked: [], allBlocked: false };
  const groups: Array<{ agents: string[]; disallowAll: boolean; allowRoot: boolean }> = [];
  let current: { agents: string[]; disallowAll: boolean; allowRoot: boolean } | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false, allowRoot: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value === "/") current.disallowAll = true;
    if (key === "allow" && value === "/") current.allowRoot = true;
  }
  const verdict = (agent: string): boolean => {
    const own = groups.find((g) => g.agents.includes(agent.toLowerCase()));
    const g = own ?? groups.find((x) => x.agents.includes("*"));
    return !!g && g.disallowAll && !g.allowRoot;
  };
  const blocked = AI_BOTS.filter(verdict);
  const star = groups.find((g) => g.agents.includes("*"));
  return { blocked, allBlocked: !!star && star.disallowAll && !star.allowRoot };
}

// ─── Head / performance helpers ──────────────────────────────────────────
export function renderBlockingScripts(html: string): number {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? "";
  return (head.match(/<script\b[^>]*\bsrc=[^>]*>/gi) ?? []).filter((tag) => !/\b(async|defer)\b|type=["']module["']/i.test(tag)).length;
}

export function ogImageUrl(html: string, pageUrl: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i);
  if (!m) return null;
  try {
    return new URL(m[1], pageUrl).toString();
  } catch {
    return null;
  }
}

/** Up to `max` distinct same-origin page links from the homepage. */
export function internalLinkSample(html: string, pageUrl: string, max = 6): string[] {
  const origin = new URL(pageUrl).origin;
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    u.hash = "";
    const key = u.toString();
    if (key === pageUrl || out.includes(key) || /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4)$/i.test(u.pathname)) continue;
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

export interface CwvMetrics {
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
}

export function cwvStatus(m: CwvMetrics): { status: ExtraCheck["status"]; detail: string } {
  const parts: string[] = [];
  let worst: ExtraCheck["status"] = "pass";
  const grade = (v: number | null, good: number, poor: number, label: string, fmt: (n: number) => string) => {
    if (v === null) return;
    const s: ExtraCheck["status"] = v <= good ? "pass" : v <= poor ? "warn" : "fail";
    if (s === "fail" || (s === "warn" && worst === "pass")) worst = s;
    parts.push(`${label} ${fmt(v)}`);
  };
  grade(m.lcpMs, 2500, 4000, "LCP", (n) => `${(n / 1000).toFixed(1)} s`);
  grade(m.inpMs, 200, 500, "INP", (n) => `${Math.round(n)} ms`);
  grade(m.cls, 0.1, 0.25, "CLS", (n) => n.toFixed(2));
  return { status: worst, detail: `Real Chrome users, 75th percentile: ${parts.join(", ")} (good: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1)` };
}

// ─── Runner ──────────────────────────────────────────────────────────────
export type SafeFetch = (url: string, init: RequestInit, timeoutMs: number) => Promise<Response>;

export interface ExtraContext {
  pageUrl: string;
  html: string;
  htmlBytes: number;
  robotsTxt: string | null;
  fetch: SafeFetch;
  cruxKey?: string | null;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function runExtraChecks(ctx: ExtraContext, budgetMs = 7_000): Promise<ExtraCheck[]> {
  const url = new URL(ctx.pageUrl);
  const tasks: Array<Promise<ExtraCheck | null>> = [];

  // AI search: robots.txt groups for AI crawlers (sync).
  const ai = blockedAiCrawlers(ctx.robotsTxt);
  tasks.push(Promise.resolve<ExtraCheck>({
    id: "ai-crawlers",
    group: "AI search",
    check: "AI crawler access",
    status: ai.allBlocked ? "fail" : ai.blocked.length ? "warn" : "pass",
    detail: ai.allBlocked
      ? "robots.txt blocks every crawler (User-agent: * / Disallow: /)"
      : ai.blocked.length
        ? `robots.txt blocks ${ai.blocked.join(", ")}: these assistants can't read or cite your site${ai.blocked.includes("OAI-SearchBot") ? " (OAI-SearchBot powers ChatGPT search)" : ""}. Fine if intentional.`
        : "AI assistants (ChatGPT, Claude, Perplexity, Gemini) may read your site",
  }));

  // AI search: /llms.txt
  tasks.push((async () => {
    try {
      const res = await ctx.fetch(`${url.origin}/llms.txt`, { method: "GET" }, 4_000);
      const type = res.headers.get("content-type") ?? "";
      const ok = res.ok && !type.includes("text/html");
      await res.body?.cancel().catch(() => {});
      return { id: "llms-txt", group: "AI search", check: "/llms.txt", status: ok ? "pass" : "warn", detail: ok ? "Present: a plain-text summary AI assistants can read" : "No /llms.txt (optional): a short plain-text guide to your site for AI assistants" } as ExtraCheck;
    } catch {
      return null;
    }
  })());

  // Security: http:// → https://
  if (url.protocol === "https:") {
    tasks.push((async () => {
      try {
        const res = await ctx.fetch(`http://${url.host}/`, { method: "GET", redirect: "manual" }, 4_000);
        await res.body?.cancel().catch(() => {});
        const loc = res.headers.get("location") ?? "";
        const ok = res.status >= 300 && res.status < 400 && loc.startsWith("https://");
        return { id: "https-redirect", group: "Security", check: "http → https redirect", status: ok ? "pass" : "warn", detail: ok ? `http:// redirects to https:// (${res.status})` : `http://${url.host}/ answers ${res.status} without redirecting to https://` } as ExtraCheck;
      } catch {
        return null;
      }
    })());
  }

  // SEO: www vs apex serve one canonical host
  const alt = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
  tasks.push((async () => {
    try {
      const res = await ctx.fetch(`${url.protocol}//${alt}/`, { method: "GET", redirect: "manual" }, 4_000);
      await res.body?.cancel().catch(() => {});
      if (res.status >= 300 && res.status < 400) {
        return { id: "host-consistency", group: "SEO", check: "One canonical host", status: "pass", detail: `${alt} redirects (${res.status})` } as ExtraCheck;
      }
      if (res.ok) {
        return { id: "host-consistency", group: "SEO", check: "One canonical host", status: "warn", detail: `Both ${url.hostname} and ${alt} serve the page: search engines may split ranking between them. Redirect one to the other.` } as ExtraCheck;
      }
      return null;
    } catch {
      return null; // alternate host not served at all: nothing to report
    }
  })());

  // Social: og:image actually loads
  const og = ogImageUrl(ctx.html, ctx.pageUrl);
  if (og) {
    tasks.push((async () => {
      try {
        const res = await ctx.fetch(og, { method: "GET" }, 5_000);
        const type = res.headers.get("content-type") ?? "";
        const size = Number(res.headers.get("content-length") ?? 0);
        await res.body?.cancel().catch(() => {});
        const ok = res.ok && type.startsWith("image/");
        const big = size > 5 * 1024 * 1024;
        return {
          id: "og-image", group: "Social", check: "Social preview image loads",
          status: !ok ? "fail" : big ? "warn" : "pass",
          detail: !ok ? `og:image ${og} answers ${res.status} (${type || "no type"}): shared links show no image` : big ? `og:image is ${(size / 1048576).toFixed(1)} MB: some apps skip images over 5 MB` : `og:image loads (${type}${size ? `, ${Math.round(size / 1024)} KB` : ""})`,
        } as ExtraCheck;
      } catch {
        return { id: "og-image", group: "Social", check: "Social preview image loads", status: "fail", detail: `og:image ${og} could not be loaded` } as ExtraCheck;
      }
    })());
  }

  // Performance: page weight + render-blocking scripts (sync)
  const kb = Math.round(ctx.htmlBytes / 1024);
  tasks.push(Promise.resolve<ExtraCheck>({
    id: "page-weight", group: "Performance", check: "HTML weight",
    status: kb <= 1024 ? "pass" : "warn",
    detail: kb <= 1024 ? `${kb} KB of HTML` : `${kb} KB of HTML: heavy pages load slowly on phones (inlined data or markup)`,
  }));
  const blocking = renderBlockingScripts(ctx.html);
  tasks.push(Promise.resolve<ExtraCheck>({
    id: "render-blocking", group: "Performance", check: "Render-blocking scripts",
    status: blocking >= 3 ? "warn" : "pass",
    detail: blocking ? `${blocking} script${blocking === 1 ? "" : "s"} in <head> without async/defer delay the first paint` : "No render-blocking scripts in <head>",
  }));

  // SEO: broken links from the homepage (sample)
  const links = internalLinkSample(ctx.html, ctx.pageUrl, 6);
  if (links.length) {
    tasks.push((async () => {
      const results = await Promise.all(links.map(async (l) => {
        try {
          const res = await ctx.fetch(l, { method: "GET" }, 4_000);
          await res.body?.cancel().catch(() => {});
          return { l, status: res.status };
        } catch {
          return { l, status: 0 };
        }
      }));
      const broken = results.filter((r) => r.status >= 400);
      return {
        id: "broken-links", group: "SEO", check: "Homepage links work",
        status: broken.length ? "fail" : "pass",
        detail: broken.length
          ? `${broken.length} of ${results.length} links checked are broken: ${broken.map((b) => `${new URL(b.l).pathname} (${b.status})`).join(", ")}`
          : `${results.filter((r) => r.status > 0).length} of ${results.length} homepage links checked load`,
      } as ExtraCheck;
    })());
  }

  // Performance: real-user Core Web Vitals (CrUX), when a key is configured.
  if (ctx.cruxKey) {
    tasks.push((async () => {
      try {
        const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(ctx.cruxKey!)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: url.origin, metrics: ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"] }),
          signal: AbortSignal.timeout(5_000),
        });
        if (res.status === 404) return { id: "core-web-vitals", group: "Performance", check: "Real-user speed (Core Web Vitals)", status: "pass", detail: "Not enough Chrome traffic yet for real-user speed data" } as ExtraCheck;
        if (!res.ok) return null;
        const body = await res.json() as { record?: { metrics?: Record<string, { percentiles?: { p75?: number | string } }> } };
        const p75 = (k: string) => {
          const v = body.record?.metrics?.[k]?.percentiles?.p75;
          return v === undefined ? null : Number(v);
        };
        const { status, detail } = cwvStatus({ lcpMs: p75("largest_contentful_paint"), inpMs: p75("interaction_to_next_paint"), cls: p75("cumulative_layout_shift") });
        return { id: "core-web-vitals", group: "Performance", check: "Real-user speed (Core Web Vitals)", status, detail } as ExtraCheck;
      } catch {
        return null;
      }
    })());
  }

  const settled = await withTimeout(Promise.all(tasks.map((t) => t.catch(() => null))), budgetMs);
  return (settled ?? []).filter((x): x is ExtraCheck => !!x);
}

// ─── JavaScript shells: raw head + rendered content ──────────────────────
/** Content fields come from the rendered page; head/technical fields stay from the raw HTML crawlers see. */
export const CONTENT_FIELDS = [
  "h1Count", "h1Texts", "headingOutline", "imagesWithoutAlt", "imagesTotal", "internalLinks", "externalLinks",
  "wordCount", "hasPricingPage", "pricingEvidence", "isStore", "ctaButtons", "trustSignals",
] as const;

/** Checks that read page content: on an unrendered shell they're "not measured", not failures. */
export const CONTENT_CHECKS = ["Single H1", "Heading structure", "Image alt coverage", "Content depth", "Pricing page", "Call-to-action", "Trust signals"];

/** Finding titles that describe content (dropped when the content wasn't measured). */
export const CONTENT_FINDINGS = [
  "Your homepage has no H1 headline", "Your H1 headline is too vague", "No clear call-to-action on the homepage",
  "Pricing is hidden from the homepage", "No visible trust signals", "Thin trust signals", "Homepage has very little content",
  "Images are invisible to search engines",
];
