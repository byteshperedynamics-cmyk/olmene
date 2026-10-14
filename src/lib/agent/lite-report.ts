/**
 * Lite report: what a free fix preview plans from when there is no full
 * report yet. The fixers trigger on the same 21 checklist labels the free
 * scan returns, so the scan's checklist is enough to plan; product facts come
 * from the homepage's own title, description and text (the copy drafter reads
 * the text excerpt, see planner.ts). Research sections stay empty.
 */
import type { ReportData, SeoCheck } from "@/lib/report-types";

export interface ScanRow {
  id: string;
  site_url: string;
  result: {
    siteUrl?: string;
    fetchedAt?: string;
    checklist?: SeoCheck[];
    stats?: { title?: string | null; h1?: string | null; metaDescription?: string | null; appStoreId?: string | null };
    extras?: Array<{ id: string; status: "pass" | "warn" | "fail"; detail: string }>;
    category?: { id: string; label: string } | null;
    platform?: { id: string } | null;
  } | null;
  page_text: string | null;
  profile: Partial<ReportData["product"]> & { positioning?: string } | null;
}

const SEPARATORS = /\s+[|–—:·•-]\s+/;

/** "Acme — Analytics for small teams" → { name: "Acme", rest: "Analytics for small teams" } */
export function splitTitle(title: string | null | undefined, host: string): { name: string; rest: string } {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  const parts = t.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  const hostName = host.replace(/^www\./, "").split(".")[0];
  if (parts.length >= 2) {
    // The brand is usually the part that matches the domain; else the shorter side.
    const byHost = parts.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, "").includes(hostName.toLowerCase()));
    const name = byHost ?? (parts[0].length <= parts[parts.length - 1].length ? parts[0] : parts[parts.length - 1]);
    return { name, rest: parts.filter((p) => p !== name).join(" — ") };
  }
  if (t) return { name: t.length <= 40 ? t : hostName.charAt(0).toUpperCase() + hostName.slice(1), rest: t.length <= 40 ? "" : t };
  return { name: hostName.charAt(0).toUpperCase() + hostName.slice(1), rest: "" };
}

export function liteReportFromScan(scan: ScanRow): ReportData {
  const siteUrl = scan.result?.siteUrl ?? scan.site_url;
  let host = "";
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    host = siteUrl;
  }
  const stats = scan.result?.stats ?? {};
  const { name, rest } = splitTitle(stats.title, host);
  const oneLiner = (scan.profile?.oneLiner ?? stats.metaDescription ?? rest ?? stats.h1 ?? "").trim();
  const product: ReportData["product"] = {
    name: scan.profile?.name ?? name,
    category: scan.profile?.category ?? "website",
    oneLiner,
    offerings: scan.profile?.offerings ?? [],
    pricingModel: scan.profile?.pricingModel ?? "",
    targetCustomers: scan.profile?.targetCustomers ?? [],
    valueProps: scan.profile?.valueProps ?? [],
  };
  return {
    meta: {
      siteUrl,
      generatedAt: scan.result?.fetchedAt ?? new Date().toISOString(),
      language: "English",
      modelsUsed: [],
      schemaVersion: 1,
      lite: true,
      pageExcerpt: (scan.page_text ?? "").slice(0, 4000),
      extras: (scan.result?.extras ?? []).map((e) => ({ id: e.id, status: e.status, detail: e.detail })),
      category: scan.result?.category ? { id: scan.result.category.id, label: scan.result.category.label } : null,
      appStoreId: stats.appStoreId ?? null,
      platformId: scan.result?.platform?.id ?? null,
    },
    executiveSummary: { headline: "", scores: { overall: 0, messaging: 0, positioning: 0, conversion: 0, seo: 0, trust: 0 }, topFindings: [], biggestOpportunity: "" },
    product,
    market: { definition: "", size: { value: "", basis: "", confidence: "low", sourceIds: [] }, trends: [], segments: [], potentialAssessment: "" },
    competitors: [],
    audit: { messaging: [], conversion: [], seo: { checklist: scan.result?.checklist ?? [], findings: [] }, trust: [], pricingPresentation: [] },
    strategy: { positioning: { statement: scan.profile?.positioning ?? oneLiner, differentiators: [] }, icp: [] },
    roadmap: { quickWins: [], days30: [], days60: [], days90: [] },
    risks: [],
    assumptions: [],
    sources: [],
    conversionDiff: null,
  };
}
