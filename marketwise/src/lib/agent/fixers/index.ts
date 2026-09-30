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
  escapeHtmlAttr,
  insertCanonical,
  insertJsonLd,
  insertMetaDescription,
  normalizeSiteUrl,
  replaceH1Text,
} from "../htmlfile";

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

export interface FixerContext {
  report: ReportData;
  siteUrl: string;
  homepagePath: string | null;
  homepageHtml: string | null;
  treePaths: string[];
  repo: { owner: string; name: string; defaultBranch: string };
  copy: CopyDrafts;
}

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
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const canonical = normalizeSiteUrl(ctx.siteUrl);
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
// 3. json-ld-org (Organization + WebApplication, appended as its own script)
// ───────────────────────────────────────────────────────────────────────────

const jsonLdFixer: Fixer = {
  id: "json-ld-org",
  title: "Organization + WebApplication JSON-LD",
  detect: (report) => triggeredBy(check(report, "Structured data (JSON-LD)")),
  build: (ctx) => {
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    const url = normalizeSiteUrl(ctx.siteUrl);
    const org = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: ctx.report.product.name,
      url,
      description: ctx.report.product.oneLiner,
    };
    const webApp = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: ctx.report.product.name,
      url,
      applicationCategory: ctx.report.product.category || "BusinessApplication",
      description: ctx.report.product.oneLiner,
      offers: {
        "@type": "Offer",
        description: ctx.report.product.pricingModel || undefined,
      },
    };
    // Multiple <script type="application/ld+json"> blocks are valid and are
    // merged by search engines — safer than rewriting an existing @graph.
    const payload = { "@context": "https://schema.org", "@graph": [org, webApp] };
    const after = insertJsonLd(ctx.homepageHtml, payload);
    if (after === null) return { skip: "No </head> anchor found for the JSON-LD script." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation:
        "Appends a JSON-LD script (Organization + WebApplication in a @graph) built from the report's product profile. Existing structured data is left untouched.",
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
    // Only act when the repo is confidently understood as static HTML —
    // framework repos serve these files from build dirs we must not touch.
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
    if (!ctx.homepagePath || !ctx.homepageHtml) return { skip: "Homepage file not confidently identified." };
    // Prefer an existing pricing page file in the repo when one exists.
    const pricingFile =
      ctx.treePaths.find((p) => /^pricing\.html?$/i.test(p)) ??
      ctx.treePaths.find((p) => /^prices?\.html?$/i.test(p)) ??
      null;
    const href = pricingFile ? `/${pricingFile}` : "/pricing.html";
    const after = addPricingLink(ctx.homepageHtml, href);
    if (after === null) return { skip: "No navigation/footer anchor found to attach a Pricing link safely." };
    return {
      edits: [{ path: ctx.homepagePath, before: ctx.homepageHtml, after }],
      explanation: `Adds a Pricing link (${href}) to the site navigation, reusing the classes of the neighboring link so styling is preserved.`,
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
];

export const FIXER_IDS = new Set(FIXERS.map((f) => f.id));

export function getFixer(id: string): Fixer | undefined {
  return FIXERS.find((f) => f.id === id);
}

/** Ordering priority: fails first, then warns; sitemap/robots after head tags. */
export const FIXER_ORDER: Record<string, number> = {
  "meta-description": 10,
  "canonical-url": 20,
  "json-ld-org": 30,
  "image-alt": 40,
  "pricing-link": 50,
  "h1-rewrite": 60,
  "sitemap-robots": 70,
};

export const MAX_ACTIONS_PER_JOB = 8;

export { escapeHtmlAttr };
