/** TypeScript types for the report data model (schemaVersion 1). Mirrors the Report schema in supabase/functions/advance-analysis. */

export interface ScoreSet {
  overall: number;
  messaging: number;
  positioning: number;
  conversion: number;
  seo: number;
  trust: number;
}

export interface AuditFinding {
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  evidence: string;
  recommendation: string;
}

export interface SeoCheck {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface Competitor {
  name: string;
  url: string;
  positioning: string;
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
  gapToExploit: string;
  threat: "high" | "medium" | "low";
  sourceIds: string[];
}

export interface RoadmapAction {
  title: string;
  why: string;
  how: string;
  effort: string;
  impact: string;
  kpi: string;
  dependsOn?: string;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  retrievedAt?: string;
}

/**
 * Grounded before/after rewrites of the hero copy (the pipeline's "gitdiff"
 * step). Present on reports since 2026-10; null when the hero couldn't be read.
 */
export interface ConversionDiffField {
  kind: "h1" | "subheadline" | "cta";
  before: string;
  after: string;
  rationale: string;
  tag: string;
  /** Pre-rendered before/after snippet (escaped HTML from the engine). */
  snippetHtml: string;
  lengthDelta: number;
  lengthWarn: boolean;
}

export interface ConversionDiff {
  fields: ConversionDiffField[];
}

export interface ReportData {
  meta: {
    siteUrl: string;
    generatedAt: string;
    language: string;
    modelsUsed: string[];
    schemaVersion: number;
    /** Lite report built from a free scan for a fix preview (no research sections). */
    lite?: boolean;
    /** Lite reports: visible homepage text, server-side only (fix copy drafting). */
    pageExcerpt?: string;
    /** Unscored site checks from the free scan (AI search, links…) when the plan came from a scan. */
    extras?: Array<{ id: string; status: "pass" | "warn" | "fail"; detail: string }>;
    /** engine v2: kind of business detected by the free scan (local, restaurant, ecommerce, saas…). */
    category?: { id: string; label: string } | null;
    /** engine v2: App Store app id linked from the homepage (smart app banner fix). */
    appStoreId?: string | null;
    /** engine v2: what the site is built with (free scan platform id), for guided fixes. */
    platformId?: string | null;
    /** engine v2: mobile lab speed (PageSpeed Insights) measured during the report. */
    speed?: { source: string; performance: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null } | null;
    /** engine v2: market claims whose numbers were checked against their cited sources. */
    /** headlineUnverified: the headline repeats a market figure flagged unverified below. */
    quality?: { claimsChecked: number; claimsUnverified: number; headlineUnverified?: boolean };
  };
  executiveSummary: {
    headline: string;
    scores: ScoreSet;
    topFindings: string[];
    biggestOpportunity: string;
  };
  product: {
    name: string;
    category: string;
    oneLiner: string;
    offerings: string[];
    pricingModel: string;
    targetCustomers: string[];
    valueProps: string[];
  };
  market: {
    definition: string;
    /** verified (engine v2): false when a number in the claim isn't in any cited source; absent when there's no number to check. */
    size: { value: string; basis: string; confidence: string; sourceIds: string[]; verified?: boolean };
    trends: { trend: string; implication: string; sourceIds: string[]; verified?: boolean }[];
    segments: { name: string; fitScore: number; why: string; howToReach: string }[];
    potentialAssessment: string;
  };
  competitors: Competitor[];
  audit: {
    messaging: AuditFinding[];
    conversion: AuditFinding[];
    seo: { checklist: SeoCheck[]; findings: AuditFinding[] };
    trust: AuditFinding[];
    pricingPresentation: AuditFinding[];
  };
  strategy: {
    positioning: { statement: string; differentiators: string[] };
    icp: { persona: string; painPoints: string[]; triggers: string[]; objections?: string[] }[];
    channels?: { channel: string; priority: number; rationale: string; firstSteps: string[]; effort?: string; expectedImpact?: string }[];
    offerAndPricingIdeas?: string[];
    contentThemes?: string[];
    quickWins?: { title: string; why: string; effort: string; impact: string; kpi: string }[];
  };
  roadmap: {
    quickWins: RoadmapAction[];
    days30: RoadmapAction[];
    days60: RoadmapAction[];
    days90: RoadmapAction[];
  };
  risks: { risk: string; mitigation: string }[];
  assumptions: string[];
  sources: Source[];
  conversionDiff?: ConversionDiff | null;
}
