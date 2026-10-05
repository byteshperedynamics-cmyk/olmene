/**
 * Static-HTML target detection + minimal-diff edit operations.
 *
 * Design rules (spec §4.1):
 *  - "Skip rather than guess": detection returns null with a reason unless a
 *    single homepage file is confidently identified.
 *  - "Preserve CSS classes/style": edits insert/replace the smallest possible
 *    fragment; surrounding markup is byte-preserved.
 *  - Supported targets: static HTML, Next.js App Router (root layout) and
 *    Astro (pages/index.astro + its layout). Other frameworks are detected
 *    and skipped with an explicit reason.
 */

export interface TargetDetection {
  homepagePath: string | null;
  reason?: string;
  repoType: "static-html" | "nextjs-app" | "astro" | "framework" | "unknown";
  /** Next.js: the root layout file (app/layout.* or src/app/layout.*). */
  nextLayoutPath?: string;
  /** Astro: the homepage page file. */
  astroIndexPath?: string;
}

const NEXT_LAYOUTS = ["app/layout.tsx", "app/layout.jsx", "app/layout.ts", "app/layout.js"];
const ASTRO_CONFIGS = ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.cjs"];

const COMMON_DIRS = ["", "site/", "docs/", "public/", "www/", "_site/", "dist/", "static/", "src/"];
const FRAMEWORK_MARKERS = [
  "package.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "nuxt.config.js",
  "nuxt.config.ts",
  "svelte.config.js",
  "astro.config.mjs",
  "angular.json",
  "gatsby-config.js",
];

export function detectTarget(paths: string[]): TargetDetection {
  const set = new Set(paths.filter((p) => !p.startsWith(".github/")));
  if (set.size === 0) return { homepagePath: null, reason: "empty repository", repoType: "unknown" };

  // Next.js App Router: the root layout is where head metadata lives.
  const nextLayouts = [...NEXT_LAYOUTS, ...NEXT_LAYOUTS.map((p) => `src/${p}`)].filter((p) => set.has(p));
  if (nextLayouts.length === 1 && [...set].some((p) => p.startsWith("next.config"))) {
    return { homepagePath: null, repoType: "nextjs-app", nextLayoutPath: nextLayouts[0] };
  }
  if (nextLayouts.length > 1) {
    return {
      homepagePath: null,
      reason: `Multiple root layouts (${nextLayouts.join(", ")}) — cannot pick confidently.`,
      repoType: "framework",
    };
  }
  // Astro: src/pages/index.astro is the homepage.
  if (ASTRO_CONFIGS.some((c) => set.has(c)) && set.has("src/pages/index.astro")) {
    return { homepagePath: null, repoType: "astro", astroIndexPath: "src/pages/index.astro" };
  }

  // Other framework repos: code we do not edit yet.
  const hasPackageJson = set.has("package.json");
  const hasFrameworkMarker = FRAMEWORK_MARKERS.some((m) => set.has(m));
  const htmlFiles = [...set].filter((p) => p.endsWith(".html") || p.endsWith(".htm"));
  const rootIndex = set.has("index.html");
  if (hasFrameworkMarker || (hasPackageJson && !rootIndex)) {
    return {
      homepagePath: null,
      reason:
        "This repository uses a framework Olmene can't edit yet. Supported today: static HTML sites, Next.js (App Router) and Astro.",
      repoType: "framework",
    };
  }

  // Static HTML: root index.html wins.
  if (rootIndex) return { homepagePath: "index.html", repoType: "static-html" };

  // Otherwise look in common dirs — accept only if exactly one candidate.
  const candidates = COMMON_DIRS.map((d) => `${d}index.html`).filter((p) => set.has(p));
  if (candidates.length === 1) {
    return { homepagePath: candidates[0], repoType: "static-html" };
  }
  if (candidates.length > 1) {
    return {
      homepagePath: null,
      reason: `Multiple index.html candidates (${candidates.slice(0, 3).join(", ")}…) — cannot pick confidently.`,
      repoType: "static-html",
    };
  }
  if (htmlFiles.length === 1) {
    return { homepagePath: htmlFiles[0], repoType: "static-html" };
  }
  return {
    homepagePath: null,
    reason: htmlFiles.length
      ? `No index.html found (${htmlFiles.length} html files) — cannot identify the homepage confidently.`
      : "No HTML files in the repository.",
    repoType: "unknown",
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Edit operations — each returns the new content or null (→ fixer skips)
// ───────────────────────────────────────────────────────────────────────────

export function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function detectIndent(html: string, anchor: RegExp): string {
  const m = html.match(anchor);
  if (m && m[0]) {
    const lineStart = html.lastIndexOf("\n", m.index ?? 0) + 1;
    const raw = html.slice(lineStart, m.index ?? 0);
    return /^[ \t]*$/.test(raw) ? raw : "  ";
  }
  return "  ";
}

/** Indentation used by children of <head> (first indented line after it). */
function headChildIndent(html: string): string {
  const headOpen = html.search(/<head[^>]*>/i);
  if (headOpen < 0) return "  ";
  const after = html.slice(headOpen).replace(/^<head[^>]*>/i, "");
  const m = after.match(/\n([ \t]*)<(?!\/head)/i);
  return m ? m[1] : detectIndent(html, /<head[^>]*>/i) + "  ";
}

/** Insert or replace <meta name="description">. Preserves existing formatting. */
export function insertMetaDescription(html: string, description: string): string | null {
  const desc = escapeHtmlAttr(description.trim());
  if (!desc) return null;

  const existing = html.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i);
  if (existing) {
    const tag = existing[0];
    if (/content=["'][^"']*["']/i.test(tag)) {
      return html.replace(tag, tag.replace(/content=["'][^"']*["']/i, `content="${desc}"`));
    }
    return html.replace(tag, tag.replace(/\/?>$/, ` content="${desc}">`));
  }

  // Insert after <title>…</title> if present, else after <head>
  const titleEnd = html.search(/<\/title>/i);
  const headOpen = html.search(/<head[^>]*>/i);
  let insertAt: number;
  if (titleEnd >= 0) insertAt = titleEnd + "</title>".length;
  else if (headOpen >= 0) insertAt = html.slice(headOpen).search(/>/) + headOpen + 1;
  else return null;

  const titleIndent = titleEnd >= 0 ? detectIndent(html, /<title[\s>]/i) : detectIndent(html, /<head[^>]*>/i);
  const nl = html.slice(0, insertAt).endsWith("\n") ? titleIndent : `\n${titleIndent}`;
  return `${html.slice(0, insertAt)}${nl}<meta name="description" content="${desc}">${html.slice(insertAt)}`;
}

/** Insert <link rel="canonical"> into <head>. */
export function insertCanonical(html: string, canonicalUrl: string): string | null {
  return insertCanonicalTag(html, `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">`);
}

/**
 * Canonical for a shared Astro layout: built from each page's own path, so
 * the layout never points every page at the homepage.
 */
export function insertAstroCanonical(html: string, siteUrl: string): string | null {
  return insertCanonicalTag(html, `<link rel="canonical" href={new URL(Astro.url.pathname, ${JSON.stringify(siteUrl)})} />`);
}

function insertCanonicalTag(html: string, tag: string): string | null {
  if (/<link\s+[^>]*rel=["']canonical["']/i.test(html)) return null; // already present → skip
  const headOpen = html.search(/<head[^>]*>/i);
  if (headOpen < 0) return null;
  const insertAt = headOpen + html.slice(headOpen).search(/>/) + 1;
  const indent = headChildIndent(html);
  return `${html.slice(0, insertAt)}\n${indent}${tag}${html.slice(insertAt)}`;
}

const VIEWPORT_CONTENT = "width=device-width, initial-scale=1";

/**
 * Insert <meta name="viewport"> right after <meta charset> (or first in <head>).
 * Returns null when a viewport tag already exists or there is no <head>.
 */
export function insertViewport(html: string, selfClosing = false): string | null {
  if (/<meta\s+[^>]*name=["']viewport["']/i.test(html)) return null;
  const tag = `<meta name="viewport" content="${VIEWPORT_CONTENT}"${selfClosing ? " /" : ""}>`;
  const charset = html.match(/<meta\s+[^>]*charset\s*=[^>]*>/i);
  let insertAt: number;
  if (charset && charset.index !== undefined) {
    insertAt = charset.index + charset[0].length;
  } else {
    const headOpen = html.search(/<head[^>]*>/i);
    if (headOpen < 0) return null;
    insertAt = headOpen + html.slice(headOpen).search(/>/) + 1;
  }
  return `${html.slice(0, insertAt)}\n${headChildIndent(html)}${tag}${html.slice(insertAt)}`;
}

/** Decode the few entities that appear in titles/attributes, so values are not escaped twice. */
export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export interface MetaTagSpec {
  attr: "property" | "name";
  key: string;
  content: string;
}

/**
 * Insert the <meta property|name="key"> tags that are not already in <head>,
 * just before </head>. Existing tags are never changed. Returns null when
 * there is no </head>.
 */
export function insertMetaTags(
  html: string,
  specs: MetaTagSpec[],
  selfClosing = false,
): { html: string; added: string[] } | null {
  const headClose = html.search(/<\/head>/i);
  if (headClose < 0) return null;
  const head = html.slice(0, headClose);
  const missing = specs.filter((s) => {
    const key = s.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${key}["']`, "i").test(head);
  });
  if (missing.length === 0) return { html, added: [] };
  const indent = headChildIndent(html);
  // Insert at the start of the </head> line so its own indentation survives.
  const lineStart = html.lastIndexOf("\n", headClose) + 1;
  const insertAt = /^[ \t]*$/.test(html.slice(lineStart, headClose)) ? lineStart : headClose;
  const block = missing
    .map((s) => `${indent}<meta ${s.attr}="${s.key}" content="${escapeHtmlAttr(s.content)}"${selfClosing ? " /" : ""}>\n`)
    .join("");
  return {
    html: `${html.slice(0, insertAt)}${insertAt === headClose ? "\n" : ""}${block}${html.slice(insertAt)}`,
    added: missing.map((s) => s.key),
  };
}

/** Append an Org + WebApplication JSON-LD script before </head>. */
export function insertJsonLd(html: string, jsonLd: unknown): string | null {
  const serialized = JSON.stringify(jsonLd, null, 2);
  if (!serialized || serialized.length > 20_000) return null;
  const headClose = html.search(/<\/head>/i);
  if (headClose < 0) return null;
  const indent = headChildIndent(html);
  // Insert at the start of the </head> line so its own indentation survives.
  const lineStart = html.lastIndexOf("\n", headClose) + 1;
  const insertAt = /^[ \t]*$/.test(html.slice(lineStart, headClose)) ? lineStart : headClose;
  const block = `${indent}<script type="application/ld+json">\n${serialized
    .split("\n")
    .map((l) => indent + "  " + l)
    .join("\n")}\n${indent}</script>\n`;
  return `${html.slice(0, insertAt)}${insertAt === headClose ? "\n" : ""}${block}${html.slice(insertAt)}`;
}

export interface ImgWithoutAlt {
  fullTag: string;
  src: string | null;
}

/** Find <img> tags with no alt attribute. */
export function findImagesWithoutAlt(html: string): ImgWithoutAlt[] {
  const out: ImgWithoutAlt[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/\balt\s*=/i.test(tag)) {
      const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
      out.push({ fullTag: tag, src });
    }
  }
  return out;
}

/**
 * Add alt attributes to <img> tags missing them, matching the attribute
 * style (quoted/unquoted) of each tag. Preserves everything else byte-for-byte.
 */
export function addAltAttributes(html: string, altBySrc: Map<string, string>): string {
  const imgs = findImagesWithoutAlt(html);
  if (imgs.length === 0) return html;
  let out = html;
  for (const img of imgs) {
    const alt = img.src ? altBySrc.get(img.src) : undefined;
    if (!alt) continue;
    const altAttr = ` alt="${escapeHtmlAttr(alt)}"`;
    const patched = img.fullTag.replace(/\s*\/?>$/, (tail) =>
      tail.trim() === "/>" ? `${altAttr} />` : `${altAttr}>`,
    );
    out = out.replace(img.fullTag, patched);
  }
  return out;
}

/** True if a link whose text/href mentions pricing already exists. */
export function hasPricingLink(html: string): boolean {
  const re = /<a\b[^>]*href=["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[0].match(/href=["']([^"']*)["']/i)?.[1] ?? "";
    const text = m[1].replace(/<[^>]+>/g, " ").toLowerCase();
    if (/pricing|plans|tarifas|preise|prix|prezzi|料金|价格/i.test(href) || /pricing|plans/i.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Add a Pricing link to the first <nav>, else the <footer>, reusing the
 * classes of a sibling link (and its <li> wrapper) so styling is preserved.
 * Never falls back to the page body: the first <a> there can sit inside a
 * sentence, and cloning it corrupted copy on a real site ("Mozilla
 * ManifestoMozilla Manifesto"). The label is always "Pricing".
 */
export function addPricingLink(html: string, pricingHref = "/pricing.html"): string | null {
  if (hasPricingLink(html)) return null;

  const containerMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i) ?? html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i);
  if (!containerMatch) return null;

  const [container, inner] = containerMatch;
  // Template = the LAST link in the container (insert right after it).
  const links = [...inner.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)];
  const last = links[links.length - 1];
  if (!last || last.index === undefined) return null;
  const attrs = last[0].match(/^<a\b([^>]*)>/i)?.[1] ?? "";
  const newLink = `<a${attrs.replace(/\s*href\s*=\s*["'][^"']*["']/i, "")} href="${escapeHtmlAttr(pricingHref)}">Pricing</a>`;

  // If the sibling link is the only child of an <li>, add a sibling <li>.
  const afterLink = last.index + last[0].length;
  const liClose = inner.slice(afterLink).match(/^\s*<\/li>/i);
  const liOpen = inner.slice(0, last.index).match(/<li\b[^>]*>\s*$/i);
  let newInner: string;
  if (liClose && liOpen) {
    const insertAt = afterLink + liClose[0].length;
    newInner = `${inner.slice(0, insertAt)}${liOpen[0].trimEnd()}${newLink}</li>${inner.slice(insertAt)}`;
  } else {
    newInner = `${inner.slice(0, afterLink)} ${newLink}${inner.slice(afterLink)}`;
  }
  return html.replace(container, container.replace(inner, newInner));
}

/** Replace the inner text of the single <h1> — only when it exists exactly once. */
export function replaceH1Text(html: string, newText: string): string | null {
  const matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
  if (matches.length !== 1) return null;
  const h1 = matches[0];
  const open = h1.match(/^<h1\b[^>]*>/i)?.[0];
  if (!open) return null;
  const clean = newText.trim();
  if (!clean || clean.length > 160) return null;
  return html.replace(h1, `${open}${escapeHtmlAttr(clean).replace(/&#39;/g, "'")}</h1>`);
}

/** Replace exact visible text of a CTA element (strong evidence gate). */
export function replaceExactText(html: string, currentText: string, newText: string): string | null {
  const cur = currentText.trim();
  const next = newText.trim();
  if (!cur || !next || cur === next) return null;
  if (cur.length > 80 || next.length > 80) return null;
  const re = new RegExp(`(>[^<]*)(${cur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})([^<]*<)`, "i");
  if (!re.test(html)) return null; // evidence gate: quoted text must exist verbatim
  return html.replace(re, (_m, pre, _cur, post) => `${pre}${escapeHtmlAttr(next).replace(/&#39;/g, "'")}${post}`);
}

/** Build the robots.txt content for a site. */
export function buildRobotsTxt(siteUrl: string, sitemapPath = "/sitemap.xml"): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}${sitemapPath}\n`;
}

/** Build a sitemap.xml from the homepage + known internal pages. */
export function buildSitemapXml(urls: string[], lastmod: string): string {
  const entries = urls
    .map((u) => `  <url>\n    <loc>${escapeHtmlAttr(u)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/** Normalize a site URL for canonical/sitemap use. */
export function normalizeSiteUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}
