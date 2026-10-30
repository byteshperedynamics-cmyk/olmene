/** Human labels and impact for each registered fixer (src/lib/agent/fixers). */
export const FIXER_META: Record<string, { label: string; impact: "high" | "medium" }> = {
  "meta-description": { label: "Meta description", impact: "high" },
  "canonical-url": { label: "Canonical URL", impact: "medium" },
  "json-ld-org": { label: "Organization JSON-LD for AI search", impact: "high" },
  "sitemap-robots": { label: "Sitemap and robots.txt", impact: "medium" },
  "image-alt": { label: "Image alt text", impact: "medium" },
  "pricing-link": { label: "Pricing link in navigation", impact: "high" },
  "h1-rewrite": { label: "Homepage headline (H1)", impact: "high" },
  "title-tag": { label: "Page title", impact: "high" },
  "viewport-meta": { label: "Mobile viewport", impact: "high" },
  "social-meta": { label: "Social preview tags (Open Graph, X)", impact: "medium" },
  "next-metadata": { label: "Page title and meta description", impact: "high" },
  "next-metadata-routes": { label: "Sitemap and robots routes", impact: "medium" },
  "next-jsonld": { label: "Organization JSON-LD for AI search", impact: "high" },
  "jsx-image-alt": { label: "Image alt text", impact: "medium" },
  "hero-copy": { label: "Hero subheadline and button copy", impact: "high" },
  "lang-attribute": { label: "Page language", impact: "medium" },
  "llms-txt": { label: "llms.txt for AI assistants", impact: "medium" },
  "local-business-schema": { label: "Local business details for Google", impact: "high" },
  "app-banner": { label: "iPhone app banner", impact: "medium" },
};

export function fixerLabel(id: string): string {
  return FIXER_META[id]?.label ?? id;
}

export function fixerImpact(id: string): "high" | "medium" {
  return FIXER_META[id]?.impact ?? "medium";
}

/** Runner current_step → rail step, in order. */
export const RUN_STEPS = [
  { id: "plan", label: "Scan and plan" },
  { id: "preview", label: "Draft changes" },
  { id: "await_approval", label: "Your review" },
  { id: "apply", label: "Open pull request" },
  { id: "verify", label: "Verify live" },
  { id: "done", label: "Done" },
] as const;

export const ACTIVE_JOB_STATUSES = ["queued", "planning", "previewing", "applying", "verifying"];
export const TERMINAL_JOB_STATUSES = ["completed", "failed", "canceled", "killed"];

export function statusLine(status: string): string {
  switch (status) {
    case "queued":
      return "Queued — starting shortly";
    case "planning":
      return "Olmene is scanning and planning";
    case "previewing":
      return "Olmene is drafting changes";
    case "awaiting_approval":
      return "Waiting for your review";
    case "applying":
      return "Opening the pull request";
    case "verifying":
      return "Verifying on your live site";
    case "completed":
      return "Done";
    case "failed":
      return "This run stopped";
    case "killed":
      return "Stopped by a safety switch";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}

/**
 * Where a fix run's pull request stands, from opening to proof. One
 * vocabulary for the overview, the fix-run list and the run page:
 *   opened → merged, awaiting deployment → verified live | verification failed
 * plus closed without merging. `null` until a pull request exists.
 */
export type PrStage = "opened" | "closed" | "awaiting_deploy" | "verified" | "verify_failed";

export interface PrStageInput {
  pr_state?: "open" | "merged" | "closed" | null;
  pr_number?: number | null;
  step_outputs?: Record<string, unknown> | null;
}

export function prStage(job: PrStageInput): PrStage | null {
  if (!job.pr_state || !job.pr_number) return null;
  if (job.pr_state === "open") return "opened";
  if (job.pr_state === "closed") return "closed";
  const live = (job.step_outputs as { liveCheck?: { last?: { passed: number; total: number; fetchError?: string }; settled?: boolean } } | null)?.liveCheck;
  const last = live?.last;
  if (!last) return "awaiting_deploy";
  if (!last.fetchError && last.total > 0 && last.passed === last.total) return "verified";
  // Inside the first day Olmene keeps re-checking while the deploy finishes.
  return live?.settled || last.fetchError ? "verify_failed" : "awaiting_deploy";
}

export const PR_STAGE_COPY: Record<PrStage, { label: string; tone: "live" | "neutral" | "problem" | "ok" }> = {
  opened: { label: "Pull request open", tone: "neutral" },
  closed: { label: "Closed without merging", tone: "neutral" },
  awaiting_deploy: { label: "Merged, awaiting deployment", tone: "neutral" },
  verified: { label: "Verified live", tone: "ok" },
  verify_failed: { label: "Verification failed", tone: "problem" },
};
