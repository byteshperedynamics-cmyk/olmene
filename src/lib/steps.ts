/** The 11 pipeline steps shown live while an analysis runs (mirrors STEPS in supabase/functions/advance-analysis). */

import { LANGUAGES as SITE_LANGUAGES } from "@/i18n/languages";

export interface StepDef {
  id: string;
  label: string;
  hint: string;
}

export const STEPS: StepDef[] = [
  { id: "crawl", label: "Reading your website", hint: "Fetching the homepage and key pages (pricing, features, about)." },
  { id: "profile", label: "Understanding your product", hint: "Identifying what you sell, for whom, and how you position it." },
  { id: "research", label: "Researching the market", hint: "Searching the web for market data, trends and alternatives." },
  { id: "competitors_pick", label: "Selecting competitors", hint: "Choosing the most relevant competitors from real search results." },
  { id: "competitors_extract", label: "Reading competitor sites", hint: "Fetching the competitors' websites for a fair comparison." },
  { id: "competitors_analyze", label: "Analyzing competitors", hint: "Positioning, pricing, strengths, weaknesses and gaps." },
  { id: "audit", label: "Auditing your marketing", hint: "Messaging, conversion, SEO signals, trust and pricing presentation." },
  { id: "market", label: "Sizing the market", hint: "Market definition, segments, trends and potential." },
  { id: "strategy", label: "Drafting your strategy", hint: "Positioning, ICP, channels, offers and the 7/30/60/90-day roadmap." },
  { id: "gitdiff", label: "Drafting copy fixes", hint: "Grounded before/after rewrites for your hero headline, subheadline and CTA." },
  { id: "assemble", label: "Assembling your report", hint: "Validating every section and cross-checking cited sources." },
];

export const JOB_STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "status-queued" },
  running: { label: "Running", className: "status-running" },
  completed: { label: "Completed", className: "status-completed" },
  failed: { label: "Failed", className: "status-failed" },
  canceled: { label: "Canceled", className: "status-canceled" },
};

export const GOALS = [
  "first_customers",
  "grow_revenue",
  "improve_conversion",
  "enter_new_market",
  "beat_competitor",
] as const;

export const GOAL_LABELS: Record<string, string> = {
  first_customers: "Get my first customers",
  grow_revenue: "Grow revenue",
  improve_conversion: "Improve conversion",
  enter_new_market: "Enter a new market",
  beat_competitor: "Beat a competitor",
};

/**
 * Report languages: the 15 site languages first (src/i18n/languages.ts, in
 * the selector's order), then more European languages the models write well.
 * The pipeline accepts any language name.
 */
export const LANGUAGES = [
  ...SITE_LANGUAGES.map((l) => l.english),
  "Italian", "Dutch", "Polish", "Swedish", "Danish", "Norwegian", "Finnish",
];

/** Human explanation for wait_reason values shown while a job is paused (codes set by advance-analysis). */
export function waitReasonMessage(reason: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case "llm_daily":
    case "llm_daily_budget": {
      const e = new Date();
      e.setUTCHours(24, 5, 0, 0);
      const t = e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return `High demand right now — your report will resume automatically around ${t}. You can close this tab; nothing is lost.`;
    }
    case "llm_busy":
      return "Our AI providers are busy right now. Your report resumes automatically in a few minutes — you can close this tab; nothing is lost.";
    case "web_research_budget":
    case "tavily_monthly_budget":
      return "Our web-research budget for this month is exhausted. Your report will resume automatically when it resets — nothing is lost.";
    default:
      return `Analysis paused (${reason.replace(/_/g, " ")}) and will resume automatically.`;
  }
}
