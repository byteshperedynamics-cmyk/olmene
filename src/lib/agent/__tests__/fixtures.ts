/** Shared fixtures for agent tests. */

import type { ReportData } from "@/lib/report-types";

export function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    meta: {
      siteUrl: "https://acme.test",
      generatedAt: "2026-09-29T10:00:00Z",
      language: "en",
      modelsUsed: ["glm-4.7-flash"],
      schemaVersion: 1,
    },
    executiveSummary: {
      headline: "Solid product, invisible online",
      scores: { overall: 42, messaging: 50, positioning: 45, conversion: 38, seo: 30, trust: 48 },
      topFindings: ["No meta description", "No structured data"],
      biggestOpportunity: "Search visibility via basic SEO hygiene",
    },
    product: {
      name: "Acme",
      category: "Developer tools",
      oneLiner: "Acme builds fine widgets for teams that ship fast.",
      offerings: ["Widgets", "Widget Pro"],
      pricingModel: "Free tier + $19/mo Pro",
      targetCustomers: ["Small dev teams"],
      valueProps: ["Fast setup", "Reliable"],
    },
    market: {
      definition: "Widget tooling",
      size: { value: "$1.2B", basis: "estimate", confidence: "low", sourceIds: ["S1"] },
      trends: [],
      segments: [],
      potentialAssessment: "ok",
    },
    competitors: [],
    audit: {
      messaging: [
        {
          title: "Headline does not communicate value",
          severity: "medium",
          evidence: "The H1 says 'We build widgets' without naming the customer or outcome.",
          recommendation: "Lead with the outcome.",
        },
      ],
      conversion: [],
      seo: {
        checklist: [
          { check: "Title tag", status: "pass", detail: "18 chars" },
          { check: "Meta description", status: "fail", detail: "missing" },
          { check: "Single H1", status: "pass", detail: "1" },
          { check: "Canonical URL", status: "warn", detail: "missing" },
          { check: "Structured data (JSON-LD)", status: "warn", detail: "none" },
          { check: "Image alt coverage", status: "fail", detail: "1 of 1 images missing alt" },
          { check: "Pricing page", status: "warn", detail: "no pricing link found" },
          { check: "/robots.txt", status: "warn", detail: "404" },
          { check: "/sitemap.xml", status: "warn", detail: "404" },
        ],
        findings: [],
      },
      trust: [],
      pricingPresentation: [],
    },
    strategy: {
      positioning: { statement: "The fastest widgets for teams that ship.", differentiators: ["Speed"] },
      icp: [],
    },
    roadmap: { quickWins: [], days30: [], days60: [], days90: [] },
    risks: [],
    assumptions: [],
    sources: [
      { id: "S1", title: "Acme home", url: "https://acme.test/" },
      { id: "S2", title: "Pricing", url: "https://acme.test/pricing.html" },
    ],
    ...overrides,
  };
}

export const BAD_HOMEPAGE = [
  "<!DOCTYPE html>",
  '<html lang="en">',
  "<head>",
  "  <title>Acme — Widgets</title>",
  "</head>",
  "<body>",
  '  <nav><a href="/" class="nav-link">Home</a> <a href="/about" class="nav-link">About</a></nav>',
  "  <h1>We build widgets</h1>",
  "  <main><p>Acme makes the finest widgets for teams.</p>",
  '  <img src="hero.png" class="hero"></main>',
  "  <footer><p>© Acme</p></footer>",
  "</body>",
  "</html>",
].join("\n");
