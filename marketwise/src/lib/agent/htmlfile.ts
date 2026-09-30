/**
 * Static-HTML target detection + minimal-diff edit operations.
 *
 * Design rules (spec §4.1):
 *  - "Skip rather than guess": detection returns null with a reason unless a
 *    single homepage file is confidently identified.
 *  - "Preserve CSS classes/style": edits insert/replace the smallest possible
 *    fragment; surrounding markup is byte-preserved.
 *  - v1 supports static HTML targets only. Framework repos (Next.js/Vite/…)
 *    are detected and skipped with an explicit reason.
 */

export interface TargetDetection {
  homepagePath: string | null;
  reason?: string;
  repoType: "static-html" | "framework" | "unknown";
}

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

  // Framework repos: code, not static HTML — v1 skips these explicitly.
  const hasPackageJson = set.has("package.json");
  const hasFrameworkMarker = FRAMEWORK_MARKERS.some((m) => set.has(m));
  const htmlFiles = [...set].filter((p) => p.endsWith(".html") || p.endsWith(".htm"));
  const rootIndex = set.has("index.html");
  if (hasFrameworkMarker || (hasPackageJson && !rootIndex)) {
    return {
      homepagePath: null,
      reason:
        "This repository is a code project (framework or package.json detected). Phase 1 supports static HTML sites only — code-level fixes are on the roadmap.",
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
  if (/<link\s+[^>]*rel=["']canonical["']/i.test(html)) return null; // already present → skip
  const headOpen = html.search(/<head[^>]*>/i);
  if (headOpen < 0) return null;
  const insertAt = headOpen + html.slice(headOpen).search(/>/) + 1;
  const indent = detectIndent(html, /<head[^>]*>/i);
  return `${html.slice(0, insertAt)}\n${indent}<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">${html.slice(insertAt)}`;
}

/** Append an Org + WebApplication JSON-LD script before </head>. */
export function insertJsonLd(html: string, jsonLd: unknown): string | null {
  const serialized = JSON.stringify(jsonLd, null, 2);
  if (!serialized || serialized.length > 20_000) return null;
  const headClose = html.search(/<\/head>/i);
  if (headClose < 0) return null;
  const indent = detectIndent(html, /<\/head>/i);
  const block = `${indent}<script type="application/ld+json">\n${serialized
    .split("\n")
    .map((l) => indent + l)
    .join("\n")}\n${indent}</script>\n`;
  return `${html.slice(0, headClose)}${block}${html.slice(headClose)}`;
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
 * Add a Pricing link to the first <nav> (or a footer <ul> as fallback),
 * reusing the classes of a sibling link so styling is preserved.
 */
export function addPricingLink(html: string, pricingHref = "/pricing.html"): string | null {
  if (hasPricingLink(html)) return null;

  const navMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
  const containerMatch =
    navMatch ?? html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i) ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!containerMatch) return null;

  const [container, inner] = containerMatch;
  // Template = the first existing <a> in the container (keeps classes/style)
  const templateA = inner.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  if (!templateA) return null;
  const attrs = templateA[0].match(/^<a\b([^>]*)>/i)?.[1] ?? "";
  const innerText = templateA[0].replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "");
  // If the sibling link wraps elements (e.g. <span>), fall back to plain text.
  const label = innerText.replace(/<[^>]+>/g, "").trim() || "Pricing";
  const newLink = `<a${attrs.replace(/\s*href\s*=\s*["'][^"']*["']/i, "")} href="${escapeHtmlAttr(pricingHref)}">${/^[A-Za-z0-9][^<>]{0,60}$/.test(label) ? label : "Pricing"}</a>`;

  const lastLinkEnd = inner.toLowerCase().lastIndexOf("</a>");
  if (lastLinkEnd < 0) return null;
  const insertAt = lastLinkEnd + "</a>".length;
  const newInner = `${inner.slice(0, insertAt)}${newLink}${inner.slice(insertAt)}`;
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
export function buildRobotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
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
