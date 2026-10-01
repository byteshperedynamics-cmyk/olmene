/**
 * EXAMPLE DATA for v2 illustrations — the homepage review showcase, empty
 * states and the dev component gallery. Every surface that renders this must
 * show an "example" badge. Never present these figures as real metrics.
 */
import type { DiffFile } from "@/components/v2/diff-view";
import type { ChartMarker, ChartPoint, FeedItem } from "@/components/v2/data-viz";

export const SAMPLE_DIFF: DiffFile[] = [
  {
    path: "app/layout.tsx",
    diff: [
      "--- a/app/layout.tsx",
      "+++ b/app/layout.tsx",
      "@@ -12,3 +12,6 @@",
      " export const metadata = {",
      '-  title: "Acme",',
      '+  title: "Acme — Product analytics for small SaaS teams",',
      '+  description: "See where users drop off and fix it in a day.",',
      '+  alternates: { canonical: "https://acme-analytics.com" },',
      '+  openGraph: { images: ["/og.png"] },',
      " };",
    ].join("\n"),
  },
  {
    path: "components/olmene-jsonld.tsx",
    isNewFile: true,
    diff: [
      "--- /dev/null",
      "+++ b/components/olmene-jsonld.tsx",
      "@@ -0,0 +1,9 @@",
      "+export function OlmeneJsonLd() {",
      "+  const data = {",
      '+    "@context": "https://schema.org",',
      '+    "@type": "Organization",',
      '+    name: "Acme",',
      '+    url: "https://acme-analytics.com",',
      "+  };",
      '+  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;',
      "+}",
    ].join("\n"),
  },
];

/** Deterministic 60-day click series with three merges (seeded, stable across renders). */
export function sampleClickSeries(): { points: ChartPoint[]; markers: ChartMarker[] } {
  const merges = [
    { d: 15, label: "PR #9", cap: 22 },
    { d: 28, label: "PR #12", cap: 22 },
    { d: 42, label: "PR #14", cap: 48 },
  ];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const points: ChartPoint[] = [];
  for (let d = 0; d < 60; d++) {
    let base = 218 + d * 0.3;
    for (const m of merges) if (d > m.d) base += Math.min((d - m.d) * 3.2, m.cap);
    const weekend = d % 7 === 5 || d % 7 === 6 ? -24 : 0;
    points.push({ x: d + 1, y: Math.round(base + weekend + (rnd() - 0.5) * 22) });
  }
  return { points, markers: merges.map((m) => ({ x: m.d + 1, label: m.label })) };
}

export const SAMPLE_MRR_WEEKS = [400, 600, 900, 1100, 1400, 1700, 2100, 2400, 2900, 3400, 4000, 4700];

export const SAMPLE_FEED: FeedItem[] = [
  { id: "f1", title: "Meta description", site: "a SaaS homepage", ago: "2m" },
  { id: "f2", title: "JSON-LD for AI search", site: "a developer tool", ago: "9m" },
  { id: "f3", title: "Pricing link", site: "a Shopify app", ago: "14m" },
  { id: "f4", title: "Image alt text", site: "an indie game site", ago: "21m" },
  { id: "f5", title: "Canonical URL", site: "a newsletter", ago: "33m" },
  { id: "f6", title: "H1 rewrite", site: "a B2B API", ago: "41m" },
];
