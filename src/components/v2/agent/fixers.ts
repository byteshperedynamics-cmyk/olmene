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
