"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FreeAuditProvider } from "@/components/free-audit-form";
import { HomeHero } from "@/components/v2/home/hero";
import { ProofStrip, type ProofStat } from "@/components/v2/home/proof-strip";
import { HomeLoop } from "@/components/v2/home/loop";
import { ReviewShowcase } from "@/components/v2/home/review-showcase";
import { Teardown } from "@/components/v2/home/teardown";
import { CanCannot, Comparison, FinalCta, HomeFaq, PricingBand } from "@/components/v2/home/blocks";
import { CHECK_COUNT } from "@/lib/config";
import { usePageMeta } from "@/i18n/provider";
import { usePublicStats } from "@/lib/public-stats";

// Proof strip fallback — real numbers measured 2026-10-01, shown until the live
// /api/public/stats response arrives (or if it is unavailable). Never inflate.
const STATS: ProofStat[] = [
  { value: 73, label: "stats.audits" },
  { value: 198, label: "stats.sources" },
  { value: CHECK_COUNT, label: "stats.checks" },
  { value: 15, label: "stats.languages" },
];

/**
 * Homepage v2 — "the growth engineer that ships the fix".
 * Section order and copy: docs/design/IMPLEMENTATION_BRIEF.md §5A.
 * Marketing page rule: no framer-motion here (CSS motion only).
 */
export default function HomePage() {
  usePageMeta("meta.title.home", "meta.desc.home");
  const { data: live } = usePublicStats();
  const stats: ProofStat[] = live
    ? [
        { value: live.freeScans, label: "stats.audits" },
        { value: live.sourcesCited, label: "stats.sources" },
        { value: CHECK_COUNT, label: "stats.checks" },
        // fixes shipped replaces languages once the number means something
        live.prsMerged >= 20 ? { value: live.prsMerged, label: "stats.fixes" } : STATS[3],
      ]
    : STATS;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <FreeAuditProvider>
        <main id="main-content" className="flex-1">
          <HomeHero />
          <ProofStrip stats={stats} />
          <HomeLoop />
          <ReviewShowcase />
          <Teardown />
          <CanCannot />
          <Comparison />
          <PricingBand />
          <HomeFaq />
          <FinalCta />
        </main>
      </FreeAuditProvider>
      <SiteFooter />
    </div>
  );
}
