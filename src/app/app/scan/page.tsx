"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FreeAuditInput, FreeAuditProvider, FreeAuditResult } from "@/components/free-audit-form";
import { CHECK_COUNT } from "@/lib/config";

/**
 * Free scan inside the app (/app/scan/): the same scan, result card and
 * fix routes as the homepage, so signed-in people never have to go back to
 * the marketing site to check a page. It says up front what it is not: it
 * doesn't watch the site and doesn't use an analysis from the plan.
 */
export default function AppScanPage() {
  return (
    <FreeAuditProvider>
      <div className="grid gap-8">
        <header className="grid gap-1">
          <h1 className="o-display text-[28px] leading-tight">Free scan</h1>
          <p className="max-w-2xl text-[14px] text-muted-foreground">
            Checks one page in about 30 seconds: {CHECK_COUNT} checks on its live HTML, with the evidence for each problem.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="grid min-w-0 gap-6">
            <FreeAuditInput variant="hero" className="max-w-2xl" />
            <FreeAuditResult />
          </div>
          <aside className="grid gap-3 rounded-xl border bg-card p-5 text-[13.5px] leading-relaxed">
            <p className="font-medium">Free scan or full analysis?</p>
            <dl className="grid gap-3 text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground">Free scan</dt>
                <dd>One check of the basics. Doesn&apos;t add the site to your watched sites and doesn&apos;t use an analysis.</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Full analysis</dt>
                <dd>
                  Market and competitor research with sources, a five-part audit and a 90-day plan. Uses one analysis from your plan; the site is then
                  re-checked every week.
                </dd>
              </div>
            </dl>
            <Button asChild size="sm" variant="hairline" className="w-fit">
              <Link href="/app/new/">
                New analysis <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
              </Link>
            </Button>
          </aside>
        </div>
      </div>
    </FreeAuditProvider>
  );
}
