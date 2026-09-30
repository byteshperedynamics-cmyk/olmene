"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ReportViewer } from "@/components/report-viewer";
import { SAMPLE_REPORT } from "@/lib/sample-report";
import { hydrateReport, SR_LOADERS } from "@/i18n/sample-report/walk";
import type { Dict } from "@/i18n/provider";
import { useI18n, Tx, usePageMeta } from "@/i18n/provider";

/**
 * Public sample-report page.
 *
 * The report skeleton (structure + numbers) is a static fixture; its prose is
 * overlaid at runtime with the active language's sample-report dictionary
 * (a lazy ~10–15 KB chunk fetched only on this page, only for non-English).
 * English renders the fixture directly — zero extra work for the default.
 */
export function SampleReportContent() {
  const { lang, t } = useI18n();
  usePageMeta("meta.title.sample", "meta.desc.sample");
  const [srDict, setSrDict] = useState<Dict | null>(null);

  useEffect(() => {
    if (lang === "en") {
      setSrDict(null);
      return;
    }
    let alive = true;
    const load = SR_LOADERS[lang];
    if (!load) return;
    load()
      .then((mod) => {
        if (alive) setSrDict(mod.default);
      })
      .catch(() => {
        /* chunk failed — the English skeleton keeps rendering */
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  const data = useMemo(() => hydrateReport(SAMPLE_REPORT, srDict, lang), [srDict, lang]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="border-b border-border/60 bg-secondary/30 print:hidden">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 md:py-14">
            {/* Unmissable: this report is FICTIONAL. Amber badge + tinted
                banner — never mistakable for real teardown data. */}
            <div
              className="mb-6 flex items-start gap-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-4 py-3.5 dark:border-amber-400/40 dark:bg-amber-400/10"
              role="note"
            >
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {t("sample.badge")}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-amber-800/80 dark:text-amber-200/80">
                  {t("sample.badgeTip")}
                </p>
              </div>
            </div>
            <p className="section-label">{t("sample.label")}</p>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {t("sample.h1")}
            </h1>
            <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
              <Tx k="sample.body" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/login/">
                  {t("sample.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/pricing/">{t("common.seePricing")}</Link>
              </Button>
            </div>
          </div>
        </section>
        <section className="py-10 md:py-14 print:py-0">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            {/* The report card itself carries the marker too — dashed amber
                frame, so the fictional flag survives scrolling past the top
                banner (and screenshots taken from the middle of the page). */}
            <div className="rounded-2xl border-2 border-dashed border-amber-500/40 p-2 print:border-0 print:p-0 dark:border-amber-400/30">
              <ReportViewer data={data} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
