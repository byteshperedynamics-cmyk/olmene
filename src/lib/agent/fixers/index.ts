/**
 * Fixer Registry — Phase 1 fixers for static-HTML GitHub repos.
 *
 * Contract per fixer (spec §4.1): detect (deterministic, from the report) →
 * build (concrete file edits + human explanation). Build returns
 * `{ skip: reason }` whenever it is not fully confident — skipping is always
 * preferred to guessing. The LLM contributes copy drafts ONLY; it never
 * chooses files, paths, or actions.
 */

import type { ReportData, SeoCheck } from "@/lib/report-types";
import {
  addAltAttributes,
  addPricingLink,
  buildRobotsTxt,
  buildSitemapXml,
  decodeBasicEntities,
  escapeHtmlAttr,
  insertAstroCanonical,
  insertCanonical,
  insertJsonLd,
  insertMetaDescription,
  insertMetaTags,
  insertViewport,
  normalizeSiteUrl,
  replaceH1Text,
  type MetaTagSpec,
} from "../htmlfile";
import { addBodyComponent, addMetadataCanonical, setMetadataString } from "../jsfile";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface FileEdit {
  path: string;
  before: string | null; // null → new file
  after: string;
}

export interface FixerBuildResult {
  edits: FileEdit[];
  explanation: string;
  evidence: string;
  expectedScoreChange: string;
  revertSteps: string[];
}

export interface CopyDrafts {
  metaDescription?: string;
  altTexts?: Record<string, string>;
  h1?: string;
  cta?: { current: string; next: string };
}

/** A framework repo's editable entry files (loaded by the runner). */
export interface FrameworkTarget {
  kind: "nextjs-app" | "astro";
  /** Next.js: root layout. Astro: the file that owns <head> (layout or index). */
  headPath: string;
  headContent: string;
  /** Astro: the homepage page file (for H1 edits). */
  pagePath?: string;
  pageContent?: string;
}

export interface FixerContext {
  report: ReportData;
  siteUrl: string;
  homepagePath: string | null;
  homepageHtml: string | null;
  treePaths: string[];
  /** Raw package.json, when present (build-time generators, frameworks). */
  packageJson?: string | null;
  repo: { owner: string; name: string; defaultBranch: string };
  copy: CopyDrafts;
  /** Set for Next.js / Astro repos; null for static HTML or unknown repos. */
  framework?: FrameworkTarget | null;
}

const COMPONENT_CODE_SKIP =
  "This change lives in component code in this framework — Olmene does not edit components yet, so it is left for you.";

/** Head components that render description/canonical themselves (astrowind <Metadata/>, <SEO/>, <BaseHead/>…). */
const SEO_COMPONENT = /<(?:SEO|Seo|Metadata|MetaTags|Meta|BaseHead|HeadSeo|HeadSEO|SeoHead|CommonHead|Head)\b[^>]*\/?>/;
const SEO_COMPONENT_SKIP = "The layout renders its SEO tags through a component (e.g. <Metadata />) — adding a second tag would duplicate it. Set it via that component's props instead.";
/** Packages that generate the sitemap/robots at build time. */
const SITEMAP_GENERATOR = /"(@astrojs\/sitemap|next-sitemap|gatsby-plugin-sitemap|@nuxtjs\/sitemap|vite-plugin-sitemap|astro-sitemap|sitemap-generator)"/;
const ROBOTS_GENERATOR = /"(astro-robots-txt|next-sitemap|gatsby-plugin-robots-txt|@nuxtjs\/robots)"/;
/** Paths of dynamic robots/sitemap routes that must not be shadowed by static files. */
const DYNAMIC_SEO_ROUTE = /^(src\/)?app\/(robots|sitemap)\.(ts|tsx|js|jsx)$|^src\/pages\/(robots\.txt|sitemap[\w.-]*\.xml)\.(ts|js)$/;

export type BuildOutcome = FixerBuildResult | { skip: string };

export interface Fixer {
  id: string;
  title: string;
  /** Deterministic trigger from the report's SEO checklist / findings. */
  detect: (report: ReportData) => { triggered: boolean; ref: Record<string, unknown> };
  /** Produce concrete edits, or skip with a reason. */
  build: (ctx: FixerContext) => BuildOutcome;
}

function check(report: ReportData, label: string): SeoCheck | undefined {
  return report.audit.seo.checklist.find((c) => c.check === label);
}

function triggeredBy(checklist: SeoCheck | undefined): { triggered: boolean; ref: Record<string, unknown> } {
  if (!checklist || checklist.status === "pass") {
    return { triggered: false, ref: {} };
  }
  return {
    triggered: true,
    ref: { checkLabel: checklist.check, status: checklist.status, detail: checklist.detail },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. meta-description
// ───────────────────────────────────────────────────────────────────────────

const metaDescriptionFixer: Fixer = {
  id: "meta-description",
  title: "Meta description",
  detect: (report) => triggeredBy(check(report, "Meta description")),
  build: (ctx) => {
    const desc = ctx.copy.metaDescription?.trim();
    if (!desc) return { skip: "No high-confidence meta description copy could be drafted from the report." };
    if (desc.length < 50 || desc.length > 160) {
      return { skip: `Drafted meta description is ${desc.length} chars (need 50–160) — not shipping a weak tag.` };
    }
    const fw = ctx.framework;
    if (fw) {
      let after: string | null = null;
      if (fw.kind === "nextjs-app") {
        const r = setMetadataString(fw.headContent, "description", desc);
        if (!r.ok) return { skip: r.reason };
        after = r.content;
      } else {
        if (/<meta\s+[^>]*name=["']description["']/i.test(fw.headContent)) {
          return { skip: "The layout already sets a meta description (possibly from a prop) — not overriding it." };
        }
        if (SEO_COMPONENT.test(fw.headContent)) return { skip: SEO_COMPONENT_SKIP };
        after = insertMetaDescription(fw.headContent, desc);
        if (after === null) return { skip: "No <head> or <title> found in the Astro layout." };
      }
      return {
        edits: [{ path: fw.headPath, before: fw.headContent, after }],
        explanation:
          fw.kind === "nextjs-app"
            ? `Sets a ${desc.length}-character description in the root layout's metadata export. Nothing else in the file changes.`
            : `Adds a ${desc.length}-character meta description to the layout's <head>.`,
        evidence: `Report check "Meta description" failed: ${check(ctx.report, "Meta description")?.detail ?? "missing"}. Copy drafted from the report's product profile (${ctx.report.product.name}).`,
        expectedScoreChange: "SEO checklist: Meta description fail → pass (+1 of 21 checks)",
        revertSteps: ["Close the PR without merging", `Or remove the description line added to ${fw.headPath}`],
      };
    }
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const after = insertMetaDescription(ctx.homepageHtml, desc);
    if (after === null || after === ctx.homepageHtml) {
      return { skip: "Could not insert the meta tag without risky HTML surgery." };
    }
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Adds a ${desc.length}-character meta description to the homepage <head>.`,
      evidence: `Report check "Meta description" failed: ${check(ctx.report, "Meta description")?.detail ?? "missing"}. Copy drafted from the report's product profile (${ctx.report.product.name}).`,
      expectedScoreChange: "SEO checklist: Meta description fail → pass (+1 of 21 checks)",
      revertSteps: ["Merge nothing — just close the PR", "Or remove the <meta name=\"description\"> line added to <head>"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 2. canonical-url
// ───────────────────────────────────────────────────────────────────────────

const canonicalFixer: Fixer = {
  id: "canonical-url",
  title: "Canonical URL",
  detect: (report) => triggeredBy(check(report, "Canonical URL")),
  build: (ctx) => {
    const fw = ctx.framework;
    if (fw) {
      // Layouts are shared by every page, so the canonical is derived per page
      // (Next "./" + metadataBase, Astro.url.pathname); a literal homepage URL
      // would tell search engines every page is a copy of the homepage.
      const siteBase = `${normalizeSiteUrl(ctx.siteUrl)}/`;
      let after: string | null;
      if (fw.kind === "nextjs-app") {
        const r = addMetadataCanonical(fw.headContent, siteBase);
        if (!r.ok) return { skip: r.reason };
        after = r.content;
      } else {
        if (SEO_COMPONENT.test(fw.headContent)) return { skip: SEO_COMPONENT_SKIP };
        // index.astro with its own <head> is only the homepage: a literal URL is right there.
        after = fw.headPath === fw.pagePath ? insertCanonical(fw.headContent, siteBase) : insertAstroCanonical(fw.headContent, siteBase);
        if (after === null) return { skip: "Canonical link already present or no <head> found in the Astro layout." };
      }
      return {
        edits: [{ path: fw.headPath, before: fw.headContent, after }],
        explanation:
          fw.kind === "nextjs-app"
            ? `Adds a per-page canonical (alternates.canonical "./" resolved against ${siteBase}) to the root layout's metadata export.`
            : fw.headPath === fw.pagePath
              ? `Adds <link rel="canonical" href="${siteBase}"> to the homepage <head>.`
              : `Adds a per-page <link rel="canonical"> (${siteBase} + each page's path) to the layout's <head>.`,
        evidence: `Report check "Canonical URL" flagged: ${check(ctx.report, "Canonical URL")?.detail ?? "missing"}.`,
        expectedScoreChange: "SEO checklist: Canonical URL warn → pass",
        revertSteps: ["Close the PR without merging", `Or remove the canonical entry added to ${fw.headPath}`],
      };
    }
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const canonical = `${normalizeSiteUrl(ctx.siteUrl)}/`;
    const after = insertCanonical(ctx.homepageHtml, canonical);
    if (after === null) return { skip: "Canonical link already present or no <head> anchor found." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Adds <link rel="canonical" href="${canonical}"> to the homepage head.`,
      evidence: `Report check "Canonical URL" flagged: ${check(ctx.report, "Canonical URL")?.detail ?? "missing"}.`,
      expectedScoreChange: "SEO checklist: Canonical URL warn → pass",
      revertSteps: ["Close the PR (nothing merged)", "Or remove the single canonical <link> line"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 3. json-ld-org (Organization + WebApplication/WebSite, appended as its own script)
// ───────────────────────────────────────────────────────────────────────────

const jsonLdFixer: Fixer = {
  id: "json-ld-org",
  title: "Organization JSON-LD",
  detect: (report) => triggeredBy(check(report, "Structured data (JSON-LD)")),
  build: (ctx) => {
    const url = normalizeSiteUrl(ctx.siteUrl);
    const org = {
      "@type": "Organization",
      name: ctx.report.product.name,
      url,
      description: ctx.report.product.oneLiner,
    };
    // Software gets a WebApplication node; every other site (store, agency,
    // bakery, blog) a WebSite node — declaring a shop an "application" is
    // wrong data. No Offer: a price-less Offer is flagged as incomplete.
    const kind = `${ctx.report.product.category ?? ""} ${ctx.report.product.oneLiner ?? ""}`;
    const isSoftware = /\b(software|saas|apps?|applications?|platform|api|sdk|analytics|developer|plugin|extension|crm|erp|tool(?:s|kit)?)\b/i.test(kind);
    const second = isSoftware
      ? {
          "@type": "WebApplication",
          name: ctx.report.product.name,
          url,
          applicationCategory: "BusinessApplication",
          description: ctx.report.product.oneLiner,
        }
      : {
          "@type": "WebSite",
          name: ctx.report.product.name,
          url,
          description: ctx.report.product.oneLiner,
        };
    const nodesLabel = isSoftware ? "Organization + WebApplication" : "Organization + WebSite";
    // One @context on the @graph wrapper (nodes inherit it). Multiple
    // <script type="application/ld+json"> blocks are valid and are merged by
    // search engines — safer than rewriting an existing @graph.
    const payload = { "@context": "https://schema.org", "@graph": [org, second] };
    const fw = ctx.framework;
    if (fw) return buildFrameworkJsonLd(ctx, fw, payload);
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const after = insertJsonLd(ctx.homepageHtml, payload);
    if (after === null) return { skip: "No </head> anchor found for the JSON-LD script." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation:
        `Appends a JSON-LD script (${nodesLabel} in a @graph) built from the report's product profile. Existing structured data is left untouched.`,
      evidence: `Report check "Structured data (JSON-LD)" flagged: ${check(ctx.report, "Structured data (JSON-LD)")?.detail ?? "missing"}.`,
      expectedScoreChange: "SEO checklist: Structured data warn → pass",
      revertSteps: ["Close the PR (nothing merged)", "Or delete the added <script type=\"application/ld+json\"> block"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 4. sitemap-robots (creates/repairs robots.txt + sitemap.xml at repo root)
// ───────────────────────────────────────────────────────────────────────────

const sitemapRobotsFixer: Fixer = {
  id: "sitemap-robots",
  title: "robots.txt + sitemap.xml",
  detect: (report) => {
    const robots = check(report, "/robots.txt");
    const sitemap = check(report, "/sitemap.xml");
    if (
      (robots && robots.status !== "pass") ||
      (sitemap && sitemap.status !== "pass")
    ) {
      return {
        triggered: true,
        ref: {
          robotsDetail: robots?.detail ?? null,
          sitemapDetail: sitemap?.detail ?? null,
        },
      };
    }
    return { triggered: false, ref: {} };
  },
  build: (ctx) => {
    // Framework repos: static files go in public/ (served at the site root by
    // Next.js and Astro) — unless a dynamic robots/sitemap route exists.
    if (ctx.framework) return buildFrameworkSitemapRobots(ctx);
    // Otherwise only act when the repo is confidently understood as static
    // HTML — unknown layouts serve these files from build dirs we must not touch.
    if (!ctx.homepagePath) {
      return { skip: "Repository layout not confidently identified as a static site — not creating files blind." };
    }
    const base = normalizeSiteUrl(ctx.siteUrl);
    const edits: FileEdit[] = [];
    const hasRobots = ctx.treePaths.includes("robots.txt");
    const hasSitemap = ctx.treePaths.includes("sitemap.xml");
    if (!hasRobots) {
      edits.push({ path: "robots.txt", before: null, after: buildRobotsTxt(base) });
    }
    if (!hasSitemap) {
      // Homepage + internal pages the crawler saw (from report sources on the same host)
      const urls = new Set<string>([`${base}/`]);
      for (const s of ctx.report.sources ?? []) {
        try {
          const u = new URL(s.url);
          const site = new URL(base);
          if (u.host === site.host && u.protocol === site.protocol) urls.add(u.toString());
        } catch {
          /* ignore malformed */
        }
      }
      edits.push({
        path: "sitemap.xml",
        before: null,
        after: buildSitemapXml([...urls], new Date().toISOString().slice(0, 10)),
      });
    }
    if (edits.length === 0) return { skip: "robots.txt and sitemap.xml already exist in the repo." };
    return {
      edits,
      explanation: `Creates ${edits.map((e) => e.path).join(" and ")} at the repository root (files are served at the site root by GitHub Pages / static hosts).`,
      evidence: `Report checks flagged: robots.txt (${check(ctx.report, "/robots.txt")?.status ?? "n/a"}), sitemap.xml (${check(ctx.report, "/sitemap.xml")?.status ?? "n/a"}).`,
      expectedScoreChange: "SEO checklist: /robots.txt and/or /sitemap.xml warn → pass",
      revertSteps: ["Close the PR (nothing merged)", "Or delete the created robots.txt / sitemap.xml files"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 5. image-alt
// ───────────────────────────────────────────────────────────────────────────

const imageAltFixer: Fixer = {
  id: "image-alt",
  title: "Image alt text",
  detect: (report) => triggeredBy(check(report, "Image alt coverage")),
  build: (ctx) => {
    if (ctx.framework) return { skip: COMPONENT_CODE_SKIP };
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const imgs = ctx.homepageHtml.match(/<img\b[^>]*>/gi) ?? [];
    const missing = imgs.filter((t) => !/\balt\s*=/i.test(t));
    if (missing.length === 0) return { skip: "No images missing alt attributes in the repo homepage." };
    const srcs = missing
      .map((t) => t.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1])
      .filter((s): s is string => Boolean(s));
    const drafts = srcs
      .map((src) => ctx.copy.altTexts?.[src])
      .filter((alt): alt is string => Boolean(alt && alt.trim()));
    if (drafts.length < Math.ceil(srcs.length * 0.5)) {
      return {
        skip: `Alt-text drafts missing for ${srcs.length - drafts.length}/${srcs.length} images — not guessing descriptions.`,
      };
    }
    const altMap = new Map<string, string>();
    for (const src of srcs) {
      const alt = ctx.copy.altTexts?.[src]?.trim();
      if (alt && alt.length >= 3 && alt.length <= 160) altMap.set(src, alt);
    }
    const after = addAltAttributes(ctx.homepageHtml, altMap);
    if (after === ctx.homepageHtml) return { skip: "No alt attributes could be added (drafts did not match image sources)." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Adds alt text to ${altMap.size} homepage image${altMap.size === 1 ? "" : "s"} missing the attribute. Existing markup and classes are untouched.`,
      evidence: `Report check "Image alt coverage": ${check(ctx.report, "Image alt coverage")?.detail ?? "images missing alt"}. Alt text drafted with image source context; images without a confident draft were left unchanged.`,
      expectedScoreChange: "SEO checklist: Image alt coverage improves toward pass (partial if some drafts were skipped)",
      revertSteps: ["Close the PR (nothing merged)", "Or remove the alt=\"…\" attributes added to the listed <img> tags"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 6. pricing-link
// ───────────────────────────────────────────────────────────────────────────

const pricingLinkFixer: Fixer = {
  id: "pricing-link",
  title: "Visible Pricing link",
  detect: (report) => triggeredBy(check(report, "Pricing page")),
  build: (ctx) => {
    if (ctx.framework) return { skip: COMPONENT_CODE_SKIP };
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    // Only link to a pricing page that verifiably exists — a file in the repo,
    // or a page on the live site the report found. Never create a dead link.
    const pricingFile =
      ctx.treePaths.find((p) => /^(?:pricing|prices?|plans)(?:\/index)?\.html?$/i.test(p)) ?? null;
    let livePath: string | null = null;
    try {
      const siteHost = new URL(ctx.report.meta.siteUrl).host;
      for (const src of ctx.report.sources ?? []) {
        const u = new URL(src.url);
        if (u.host === siteHost && /\/(?:pricing|prices?|plans)(?:\.html?)?\/?$/i.test(u.pathname)) {
          livePath = u.pathname;
          break;
        }
      }
    } catch { /* malformed URLs: no live evidence */ }
    const href = pricingFile ? `/${pricingFile.replace(/\/index\.html?$/i, "/")}` : livePath;
    if (!href) return { skip: "No pricing page found in the repository or on the live site — add one first, then Olmene can link it." };
    const after = addPricingLink(ctx.homepageHtml, href);
    if (after === null) return { skip: "No <nav> or <footer> link list found to add a Pricing link to safely." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Adds a "Pricing" link (${href}) to the site navigation, reusing the classes of the neighboring link so styling is preserved.`,
      evidence: `Report check "Pricing page" flagged: ${check(ctx.report, "Pricing page")?.detail ?? "no visible pricing link"}.`,
      expectedScoreChange: "SEO checklist: Pricing page warn → pass",
      revertSteps: ["Close the PR (nothing merged)", "Or remove the single <a href=\"…/pricing\"> element"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 7. h1-rewrite (evidence-gated copy rewrite)
// ───────────────────────────────────────────────────────────────────────────

const h1Fixer: Fixer = {
  id: "h1-rewrite",
  title: "H1 rewrite (evidence-gated)",
  detect: (report) => {
    const single = check(report, "Single H1");
    if (single && single.status !== "pass") return triggeredBy(single);
    // Also trigger when messaging findings explicitly reference the H1.
    const messagingHit = report.audit.messaging.find(
      (f) => /\bh1\b|headline/i.test(f.title) || /\bh1\b|headline/i.test(f.evidence),
    );
    if (messagingHit) {
      return { triggered: true, ref: { findingTitle: messagingHit.title, section: "messaging" } };
    }
    return { triggered: false, ref: {} };
  },
  build: (ctx) => {
    const draft = ctx.copy.h1?.trim();
    if (!draft) return { skip: "No H1 rewrite drafted from report evidence." };
    if (ctx.framework) {
      const fw = ctx.framework;
      if (fw.kind !== "astro" || !fw.pagePath || !fw.pageContent) return { skip: COMPONENT_CODE_SKIP };
      const h1s = fw.pageContent.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
      if (h1s.length !== 1) return { skip: "The Astro homepage does not have exactly one literal <h1> — not guessing which to change." };
      if (/[{}]/.test(h1s[0])) return { skip: "The homepage <h1> is built from an expression — not rewriting it." };
      const after = replaceH1Text(fw.pageContent, draft);
      if (after === null) return { skip: "H1 rewrite could not be applied safely." };
      return {
        edits: [{ path: fw.pagePath, before: fw.pageContent, after }],
        explanation: "Rewrites the text inside the homepage <h1>. Tags, classes and surrounding markup are preserved.",
        evidence: "Report messaging finding recommends a clearer headline.",
        expectedScoreChange: "Messaging/conversion quality (subjective) — SEO unchanged",
        revertSteps: ["Close the PR without merging", "Or restore the previous H1 text from the PR diff"],
      };
    }
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const currentH1 = ctx.homepageHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (!currentH1) {
      return { skip: "Homepage has no existing <h1> to rewrite — inserting new visible layout elements is out of scope for v1." };
    }
    const after = replaceH1Text(ctx.homepageHtml, draft);
    if (after === null) return { skip: "H1 rewrite could not be applied safely (multiple/irregular H1 markup)." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Rewrites the homepage H1 text. The change is limited to the text inside the existing <h1> element — tags, classes, and surrounding markup are preserved.`,
      evidence: `Report messaging finding: ${ctx.report.audit.messaging.find((f) => /\bh1\b|headline/i.test(f.title) || /\bh1\b|headline/i.test(f.evidence))?.evidence ?? "headline improvement recommended"}. Current H1: "${currentH1[1].replace(/<[^>]+>/g, "").trim().slice(0, 120)}".`,
      expectedScoreChange: "Messaging/conversion quality (subjective) — SEO unchanged",
      revertSteps: ["Close the PR (nothing merged)", "Or restore the previous H1 text from the PR diff"],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 8. viewport-meta
// ───────────────────────────────────────────────────────────────────────────

const viewportFixer: Fixer = {
  id: "viewport-meta",
  title: "Mobile viewport",
  detect: (report) => triggeredBy(check(report, "Mobile viewport")),
  build: (ctx) => {
    const evidence = `Report check "Mobile viewport" failed: ${check(ctx.report, "Mobile viewport")?.detail ?? "no viewport meta tag"}.`;
    const explanation =
      'Adds <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>, so phones render the page at device width instead of a zoomed-out desktop layout.';
    const fw = ctx.framework;
    if (fw) {
      if (fw.kind === "nextjs-app") {
        return { skip: "Next.js renders the viewport tag itself — if it is missing on the live site, check for a custom viewport export or a <head> override." };
      }
      // Head components such as <BaseHead /> usually render the viewport tag themselves.
      if (SEO_COMPONENT.test(fw.headContent)) return { skip: SEO_COMPONENT_SKIP };
      const after = insertViewport(fw.headContent, true);
      if (after === null) return { skip: "The layout already has a viewport tag, or no <head> was found." };
      return {
        edits: [{ path: fw.headPath, before: fw.headContent, after }],
        explanation,
        evidence,
        expectedScoreChange: "SEO checklist: Mobile viewport fail → pass (+1 of 21 checks)",
        revertSteps: ["Close the PR without merging", `Or remove the viewport line added to ${fw.headPath}`],
      };
    }
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const after = insertViewport(ctx.homepageHtml);
    if (after === null) return { skip: "The homepage already has a viewport tag, or no <head> was found." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation,
      evidence,
      expectedScoreChange: "SEO checklist: Mobile viewport fail → pass (+1 of 21 checks)",
      revertSteps: ["Close the PR (nothing merged)", 'Or remove the single <meta name="viewport"> line'],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// 9. social-meta (Open Graph + Twitter card)
// ───────────────────────────────────────────────────────────────────────────

const socialMetaFixer: Fixer = {
  id: "social-meta",
  title: "Open Graph + Twitter card tags",
  detect: (report) => {
    const og = check(report, "Open Graph tags");
    const tw = check(report, "Twitter card");
    if ((og && og.status !== "pass") || (tw && tw.status !== "pass")) {
      return { triggered: true, ref: { openGraph: og?.detail ?? null, twitterCard: tw?.detail ?? null } };
    }
    return { triggered: false, ref: {} };
  },
  build: (ctx) => {
    // Social tags describe ONE page: added to a <head> shared by every page,
    // they would give every page the homepage's title in link previews.
    let path: string;
    let html: string;
    let selfClosing = false;
    const fw = ctx.framework;
    if (fw) {
      if (fw.kind === "nextjs-app") {
        return { skip: "In Next.js these come from metadata.openGraph and metadata.twitter in each page's metadata — not edited automatically yet." };
      }
      if (fw.headPath !== fw.pagePath) {
        return { skip: "The <head> is a layout shared by every page, so per-page social tags must come from each page's props — left for you." };
      }
      if (SEO_COMPONENT.test(fw.headContent)) return { skip: SEO_COMPONENT_SKIP };
      path = fw.headPath;
      html = fw.headContent;
      selfClosing = true;
    } else {
      if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
      path = ctx.homepagePath;
      html = ctx.homepageHtml;
    }
    // Only literal values: a title or description built from an expression is not copied.
    const literalTitle = html.match(/<title[^>]*>([^<{}]+)<\/title>/i)?.[1]?.trim();
    const title = literalTitle && literalTitle.length >= 3 ? decodeBasicEntities(literalTitle) : ctx.report.product.name;
    const literalDesc = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content="([^"{}]+)"/i)?.[1]?.trim();
    const description = literalDesc ? decodeBasicEntities(literalDesc) : ctx.copy.metaDescription?.trim();
    if (!title) return { skip: "No page title or product name to build the preview from." };
    const specs: MetaTagSpec[] = [
      { attr: "property", key: "og:type", content: "website" },
      { attr: "property", key: "og:url", content: `${normalizeSiteUrl(ctx.siteUrl)}/` },
      { attr: "property", key: "og:title", content: title },
      ...(description ? [{ attr: "property" as const, key: "og:description", content: description }] : []),
      { attr: "property", key: "og:site_name", content: ctx.report.product.name || title },
      // summary (small card): no og:image is added, and a large card without an image renders empty.
      { attr: "name", key: "twitter:card", content: "summary" },
    ];
    const r = insertMetaTags(html, specs, selfClosing);
    if (r === null) return { skip: "No </head> found to add the tags to." };
    if (r.added.length === 0) return { skip: "The page already has these social tags." };
    const og = check(ctx.report, "Open Graph tags");
    const tw = check(ctx.report, "Twitter card");
    return {
      edits: [{ path, before: html, after: r.html }],
      explanation: `Adds ${r.added.length} social preview tag${r.added.length === 1 ? "" : "s"} (${r.added.join(", ")}) built from the page's own title${description ? " and description" : ""}, so links shared on LinkedIn, X, Slack and WhatsApp show a proper preview. Existing tags are kept.`,
      evidence: `Report checks flagged: Open Graph tags (${og?.status ?? "n/a"}: ${og?.detail ?? "—"}), Twitter card (${tw?.status ?? "n/a"}: ${tw?.detail ?? "—"}).`,
      expectedScoreChange: "SEO checklist: Open Graph tags and Twitter card warn → pass",
      revertSteps: ["Close the PR without merging", `Or remove the added og:/twitter: meta lines in ${path}`],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Framework helpers (Next.js App Router, Astro)
// ───────────────────────────────────────────────────────────────────────────

function buildFrameworkJsonLd(ctx: FixerContext, fw: FrameworkTarget, payload: unknown): BuildOutcome {
  const evidence = `Report check "Structured data (JSON-LD)" flagged: ${check(ctx.report, "Structured data (JSON-LD)")?.detail ?? "missing"}.`;
  if (/application\/ld\+json/i.test(fw.headContent)) {
    return { skip: "The layout already emits JSON-LD — not adding a second, possibly conflicting block." };
  }
  const json = JSON.stringify(payload, null, 2);
  if (json.length > 20_000) return { skip: "Structured data payload unexpectedly large." };

  if (fw.kind === "astro") {
    const close = fw.headContent.search(/<\/head>/i);
    if (close < 0) return { skip: "No </head> found in the Astro layout." };
    const lineStart = fw.headContent.lastIndexOf("\n", close) + 1;
    const indent = (fw.headContent.slice(lineStart, close).match(/^[ \t]*/)?.[0] ?? "") + "  ";
    const body = json.split("\n").map((l, i) => (i === 0 ? l : indent + l)).join("\n");
    const tag = `${indent}<script type="application/ld+json" is:inline set:html={JSON.stringify(${body})} />\n`;
    const after = `${fw.headContent.slice(0, lineStart)}${tag}${fw.headContent.slice(lineStart)}`;
    return {
      edits: [{ path: fw.headPath, before: fw.headContent, after }],
      explanation: "Adds Organization structured data (JSON-LD) to the layout's <head>, rendered with Astro's set:html so the JSON is emitted as-is.",
      evidence,
      expectedScoreChange: "SEO checklist: Structured data warn → pass",
      revertSteps: ["Close the PR without merging", `Or delete the added <script type="application/ld+json"> line in ${fw.headPath}`],
    };
  }

  // Next.js: a small component + one import + one element in <body>
  const srcDir = fw.headPath.startsWith("src/");
  const ext = /\.(tsx|ts)$/.test(fw.headPath) ? "tsx" : "jsx";
  const compPath = `${srcDir ? "src/" : ""}components/olmene-jsonld.${ext}`;
  if (ctx.treePaths.some((p) => /(^|\/)components\/olmene-jsonld\.(tsx|jsx)$/.test(p))) {
    return { skip: "components/olmene-jsonld already exists — not overwriting it." };
  }
  const component = [
    "/**",
    " * Added by Olmene: Organization structured data (JSON-LD), so search",
    " * engines and AI answers can identify the product behind this site.",
    " */",
    "export function OlmeneJsonLd() {",
    `  const data = ${json.split("\n").join("\n  ")};`,
    "  return (",
    "    <script",
    "      type=\"application/ld+json\"",
    "      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}",
    "    />",
    "  );",
    "}",
    "",
  ].join("\n");
  const r = addBodyComponent(fw.headContent, "OlmeneJsonLd", "../components/olmene-jsonld");
  if (!r.ok) return { skip: r.reason };
  return {
    edits: [
      { path: compPath, before: null, after: component },
      { path: fw.headPath, before: fw.headContent, after: r.content },
    ],
    explanation: `Adds ${compPath} (Organization JSON-LD built from the report's product profile) and renders it once at the top of <body> in the root layout.`,
    evidence,
    expectedScoreChange: "SEO checklist: Structured data warn → pass",
    revertSteps: ["Close the PR without merging", `Or delete ${compPath} and the two lines that import and render it`],
  };
}

function buildFrameworkSitemapRobots(ctx: FixerContext): BuildOutcome {
  const dynamic = ctx.treePaths.find((p) => DYNAMIC_SEO_ROUTE.test(p));
  if (dynamic) return { skip: `A dynamic route (${dynamic}) already generates this file — not shadowing it with a static one.` };
  const base = normalizeSiteUrl(ctx.siteUrl);
  const edits: FileEdit[] = [];
  const pkg = ctx.packageJson ?? "";
  const sitemapGen = pkg.match(SITEMAP_GENERATOR)?.[1];
  const robotsGen = pkg.match(ROBOTS_GENERATOR)?.[1];
  if (sitemapGen && robotsGen) return { skip: `${sitemapGen} already generates the sitemap and robots.txt at build time.` };
  if (!ctx.treePaths.includes("public/robots.txt") && !robotsGen) {
    // Point robots.txt at the sitemap the generator actually writes.
    const sitemapPath = sitemapGen === "@astrojs/sitemap" ? "/sitemap-index.xml" : "/sitemap.xml";
    edits.push({ path: "public/robots.txt", before: null, after: buildRobotsTxt(base, sitemapPath) });
  }
  if (!ctx.treePaths.includes("public/sitemap.xml") && !sitemapGen) {
    const urls = new Set<string>([`${base}/`]);
    for (const src of ctx.report.sources ?? []) {
      try {
        const u = new URL(src.url);
        const site = new URL(base);
        if (u.host === site.host && u.protocol === site.protocol) urls.add(u.toString());
      } catch {
        /* ignore malformed */
      }
    }
    edits.push({ path: "public/sitemap.xml", before: null, after: buildSitemapXml([...urls], new Date().toISOString().slice(0, 10)) });
  }
  if (edits.length === 0) {
    return { skip: sitemapGen ? `${sitemapGen} already generates the sitemap; robots.txt already exists.` : "public/robots.txt and public/sitemap.xml already exist." };
  }
  return {
    edits,
    explanation: `Creates ${edits.map((e) => e.path).join(" and ")} — ${ctx.framework?.kind === "astro" ? "Astro" : "Next.js"} serves files in public/ at the site root.`,
    evidence: `Report checks flagged: robots.txt (${check(ctx.report, "/robots.txt")?.status ?? "n/a"}), sitemap.xml (${check(ctx.report, "/sitemap.xml")?.status ?? "n/a"}).`,
    expectedScoreChange: "SEO checklist: /robots.txt and/or /sitemap.xml warn → pass",
    revertSteps: ["Close the PR without merging", "Or delete the created files in public/"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────────

export const FIXERS: Fixer[] = [
  metaDescriptionFixer,
  canonicalFixer,
  jsonLdFixer,
  sitemapRobotsFixer,
  imageAltFixer,
  pricingLinkFixer,
  h1Fixer,
  viewportFixer,
  socialMetaFixer,
];

export const FIXER_IDS = new Set(FIXERS.map((f) => f.id));

export function getFixer(id: string): Fixer | undefined {
  return FIXERS.find((f) => f.id === id);
}

/** Ordering priority: fails first, then warns; sitemap/robots after head tags. */
export const FIXER_ORDER: Record<string, number> = {
  "meta-description": 10,
  "viewport-meta": 15,
  "canonical-url": 20,
  "json-ld-org": 30,
  // After meta-description, so the previews reuse the description it adds.
  "social-meta": 35,
  "image-alt": 40,
  "pricing-link": 50,
  "h1-rewrite": 60,
  "sitemap-robots": 70,
};

export const MAX_ACTIONS_PER_JOB = 10;

/** Report checklist labels each fixer resolves (for the PR's "still on your list"). */
export const FIXER_CHECKS: Record<string, string[]> = {
  "meta-description": ["Meta description"],
  "viewport-meta": ["Mobile viewport"],
  "canonical-url": ["Canonical URL"],
  "json-ld-org": ["Structured data (JSON-LD)"],
  "social-meta": ["Open Graph tags", "Twitter card"],
  "image-alt": ["Image alt coverage"],
  "pricing-link": ["Pricing page"],
  "h1-rewrite": ["Single H1"],
  "sitemap-robots": ["/robots.txt", "/sitemap.xml"],
};

/**
 * Report checks this PR does not resolve, each with the reason: the fixer's
 * own skip reason, or the report's detail when no fixer covers the check
 * (copy, content and design changes need a person).
 */
export function remainingChecks(
  report: ReportData,
  actions: Array<{ fixer_id: string; status: string; skip_reason: string | null }>,
): Array<{ check: string; status: string; note: string }> {
  const fixedBy = new Set<string>();
  const skippedReason = new Map<string, string>();
  for (const a of actions) {
    const labels = FIXER_CHECKS[a.fixer_id] ?? [];
    for (const label of labels) {
      if (a.status === "approved" || a.status === "applied") fixedBy.add(label);
      else if (a.status === "skipped" && a.skip_reason) skippedReason.set(label, a.skip_reason);
    }
  }
  return report.audit.seo.checklist
    .filter((c) => c.status !== "pass" && !fixedBy.has(c.check))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "fail" ? -1 : 1))
    .map((c) => ({
      check: c.check,
      status: c.status,
      note: skippedReason.get(c.check) ?? `${c.detail ?? "flagged in your report"} — needs a content or design change, so it is left for you.`,
    }));
}

export { escapeHtmlAttr };
