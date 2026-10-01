"use client";

import { OpenMetricsView } from "@/app/open/open-metrics";
import type { PublicStats } from "@/lib/public-stats";
import { SAMPLE_MRR_WEEKS } from "@/lib/v2/sample-data";

const now = Date.now();
/** EXAMPLE numbers for layout review only. */
const EXAMPLE: PublicStats = {
  freeScans: 1284,
  reports: 212,
  sourcesCited: 3410,
  prsOpened: 146,
  prsMerged: 127,
  sitesMonitored: 88,
  measuredOutcomes: 41,
  mrr: {
    current: 4700,
    weeks: SAMPLE_MRR_WEEKS.map((mrr, i) => ({ week: new Date(now - (11 - i) * 7 * 86_400_000).toISOString().slice(0, 10), mrr })),
  },
  feed: [
    { mergedAt: new Date(now - 2 * 60_000).toISOString(), fixes: ["Meta description"], site: null },
    { mergedAt: new Date(now - 9 * 60_000).toISOString(), fixes: ["Organization JSON-LD for AI search"], site: "acme/site" },
    { mergedAt: new Date(now - 3600_000).toISOString(), fixes: ["Canonical URL", "Sitemap and robots.txt"], site: null },
    { mergedAt: new Date(now - 5 * 3600_000).toISOString(), fixes: ["Homepage headline (H1)"], site: null },
    { mergedAt: new Date(now - 26 * 3600_000).toISOString(), fixes: ["Image alt text"], site: "fernbooks/web" },
    { mergedAt: new Date(now - 50 * 3600_000).toISOString(), fixes: ["Pricing link in navigation"], site: null },
  ],
  generatedAt: new Date(now).toISOString(),
};

export function OpenPreview() {
  return <OpenMetricsView data={EXAMPLE} isLoading={false} />;
}
