/** TypeScript types for the report data model (schemaVersion 1). */

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

export interface ReportData {
  meta: {
    siteUrl: string;
    generatedAt: string;
    language: string;
    modelsUsed: string[];
    schemaVersion: number;
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
    size: { value: string; basis: string; confidence: string; sourceIds: string[] };
    trends: { trend: string; implication: string; sourceIds: string[] }[];
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
}
