"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FreeAuditProvider } from "@/components/free-audit-form";
import { ClientDeliverable, Operator, SplitHero, WorkflowMatrix } from "@/components/v2/home/agency-home";
import { Teardown } from "@/components/v2/home/teardown";
import { HomeFaq, HomePlans } from "@/components/v2/home/blocks";
import { usePageMeta } from "@/i18n/provider";
import { usePublicStats } from "@/lib/public-stats";

// Floors for the activity counters, shown until /api/public/stats answers (or
// if it can't). Live values on 2026-10-13; both counters are cumulative, so a
// floor can understate but never overstate. They describe Olmene's activity,
// not customer outcomes, so they sit with the operator details, not as proof.
const SCANS_FLOOR = 107;
const SOURCES_FLOOR = 222;

/**
 * Homepage (refinement 2026-10-30): manage client sites → review fixes →
 * prove progress. Order: split hero with an inspectable example, the three
 * delivery routes, one real end-to-end case, what clients see, plans,
 * FAQ, and who operates Olmene. No 3D scene; the film plays only on request.
 * Marketing page rule: no framer-motion here (CSS motion only).
 */
export default function HomePage() {
  usePageMeta("meta.title.home", "meta.desc.home");
  const { data: live } = usePublicStats();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <FreeAuditProvider>
        <main id="main-content" className="flex-1">
          <SplitHero />
          <WorkflowMatrix />
          <Teardown />
          <ClientDeliverable />
          <HomePlans />
          <HomeFaq />
          <Operator scans={live?.freeScans ?? SCANS_FLOOR} sources={live?.sourcesCited ?? SOURCES_FLOOR} />
        </main>
      </FreeAuditProvider>
      <SiteFooter />
    </div>
  );
}
