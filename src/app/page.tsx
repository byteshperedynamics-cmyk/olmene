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

// Proof strip — real, all-time numbers from the production database
// (free_audits / reports row counts; CHECK_COUNT = the deterministic checklist
// the free audit runs today; 15 languages). Refresh periodically (or wire to
// /api/public/stats, brief §6.5) as usage grows; never inflate.
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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <FreeAuditProvider>
        <main id="main-content" className="flex-1">
          <HomeHero />
          <ProofStrip stats={STATS} />
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
