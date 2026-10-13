/**
 * Report quality score (engine v2): deterministic checks run over finished
 * reports, so prompt and model changes are measured, not guessed. Used by
 * `bun scripts/eval-reports.ts` (production reports or a folder of JSON
 * files) and by tests. 0–100, higher is better; every deduction is listed.
 */
import type { ReportData } from "@/lib/report-types";

export interface QualityIssue {
  check: string;
  detail: string;
  /** Points taken off. */
  cost: number;
}

export interface QualityResult {
  score: number;
  issues: QualityIssue[];
  stats: {
    citedClaims: number;
    marketClaims: number;
    badSourceIds: number;
    unverifiedClaims: number;
    competitors: number;
    contradictions: number;
    genericFindings: number;
    findings: number;
  };
}

const GENERIC = [
  /\bimprove (?:your )?seo\b/i, /\boptimi[sz]e (?:your )?(?:website|site|content)\b/i, /\benhance (?:the )?user experience\b/i,
  /\bboost (?:your )?(?:online )?presence\b/i, /\bleverage social media\b/i, /\bcreate (?:high[- ]quality|engaging) content\b/i,
];

/** Finding text that claims a checklist item is missing, mapped to the checklist label that would contradict it. */
const KEYWORDS: Array<[string, string]> = [
  ["meta description", "Meta description"],
  ["(?:title tag|page title)", "Title tag"],
  ["(?:h1|main headline)", "Single H1"],
  ["canonical(?: link| tag| url)?", "Canonical URL"],
  ["(?:structured data|schema markup|json-ld)", "Structured data (JSON-LD)"],
  ["alt (?:text|attributes?)", "Image alt coverage"],
  ["viewport(?: meta| tag)?", "Mobile viewport"],
  ["open graph(?: tags)?", "Open Graph tags"],
  ["(?:xml )?sitemap", "/sitemap.xml"],
  ["pricing (?:page|link)", "Pricing page"],
  ["(?:call[- ]to[- ]action|cta)s?", "Call-to-action"],
  ["(?:testimonials?|social proof|trust signals?)", "Trust signals"],
];
/** "no meta description", "missing a pricing page", "the canonical tag is missing" — the absence must be about the keyword itself. */
const CONTRADICTIONS: Array<[RegExp, string]> = KEYWORDS.map(([kw, label]) => [
  new RegExp(`\\b(?:missing|no|lacks?|lacking|without|absent|doesn't have|does not have|has no)\\W+(?:(?:a|an|any|the|clear|visible|real)\\W+){0,2}${kw}\\b|\\b${kw}\\W+(?:is|are)?\\W*(?:missing|absent|not found)\\b`, "i"),
  label,
]);

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function scoreReport(r: ReportData): QualityResult {
  const issues: QualityIssue[] = [];
  const add = (check: string, detail: string, cost: number) => issues.push({ check, detail, cost });
  const sourceIds = new Set((r.sources ?? []).map((s) => s.id));

  // 1. Citations: market claims cite sources that exist.
  const claims = [r.market?.size, ...(r.market?.trends ?? [])].filter(Boolean) as Array<{ sourceIds?: string[] }>;
  const cited = claims.filter((c) => (c.sourceIds ?? []).length > 0).length;
  const allIds = [...claims.flatMap((c) => c.sourceIds ?? []), ...(r.competitors ?? []).flatMap((c) => c.sourceIds ?? [])];
  const badIds = allIds.filter((id) => !sourceIds.has(id)).length;
  if (claims.length && cited / claims.length < 0.6) add("citations", `${cited} of ${claims.length} market claims cite a source`, 12);
  if (badIds) add("citations", `${badIds} source id(s) point at nothing`, Math.min(15, badIds * 3));

  // 2. Numbers not found in their sources (assemble's claim check).
  const unverified = r.meta?.quality?.claimsUnverified ?? 0;
  if (unverified) add("claims", `${unverified} market claim(s) have numbers not found in their cited sources`, Math.min(15, unverified * 5));

  // 3. Competitors: enough, distinct, real addresses, not the site itself.
  const comps = r.competitors ?? [];
  const siteHost = host(r.meta?.siteUrl ?? "");
  if (comps.length < 3) add("competitors", `only ${comps.length} competitor(s)`, 10);
  const hosts = comps.map((c) => host(c.url)).filter(Boolean);
  if (new Set(hosts).size < hosts.length) add("competitors", "duplicate competitor domains", 6);
  if (siteHost && hosts.includes(siteHost)) add("competitors", "the site lists itself as a competitor", 10);
  if (comps.some((c) => !/^https:\/\//.test(c.url))) add("competitors", "a competitor without an https:// address", 4);

  // 4. Findings that contradict the deterministic checklist.
  const checklist = new Map((r.audit?.seo?.checklist ?? []).map((c) => [c.check, c.status]));
  const findings = [...(r.audit?.messaging ?? []), ...(r.audit?.conversion ?? []), ...(r.audit?.seo?.findings ?? []), ...(r.audit?.trust ?? []), ...(r.audit?.pricingPresentation ?? [])];
  let contradictions = 0;
  for (const f of findings) {
    const text = `${f.title} ${f.evidence}`;
    for (const [re, label] of CONTRADICTIONS) {
      if (re.test(text) && checklist.get(label) === "pass") {
        contradictions++;
        add("contradiction", `“${f.title.slice(0, 80)}” but the checklist says ${label} passes`, 8);
        break;
      }
    }
  }

  // 5. Specific, not generic.
  const generic = findings.filter((f) => GENERIC.some((re) => re.test(`${f.title} ${f.recommendation}`))).length;
  if (generic) add("specificity", `${generic} generic finding(s)`, Math.min(12, generic * 3));
  const unquoted = findings.filter((f) => !/["“”«»„]|'[^']{6,}'/.test(f.evidence ?? "")).length;
  if (findings.length && unquoted / findings.length > 0.5) add("specificity", `${unquoted} of ${findings.length} findings quote nothing from the site`, 8);

  // 6. Complete.
  if ((r.roadmap?.quickWins ?? []).length < 3) add("completeness", "fewer than 3 quick wins", 5);
  if ((r.executiveSummary?.topFindings ?? []).length < 3) add("completeness", "fewer than 3 top findings", 4);
  if (!findings.length) add("completeness", "no audit findings", 20);

  const score = Math.max(0, 100 - issues.reduce((s, i) => s + i.cost, 0));
  return {
    score,
    issues,
    stats: { citedClaims: cited, marketClaims: claims.length, badSourceIds: badIds, unverifiedClaims: unverified, competitors: comps.length, contradictions, genericFindings: generic, findings: findings.length },
  };
}
