"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <section className="border-b border-edge print:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-14">
            {/* Fictional data, marked where it can't be missed: here, in the report's sources, and at the foot. */}
            <span className="inline-flex rounded-md border border-tel-amber/40 px-2 py-0.5 text-[13px] font-medium text-tel-amber">{t("sample.badge")}</span>
            <h1 className="o-display mt-4 max-w-3xl text-[34px] leading-[1.08] sm:text-[44px]">{t("sample.h1")}</h1>
            <p className="mt-4 max-w-[64ch] leading-relaxed text-muted-foreground">
              <Tx k="sample.body" />
            </p>
            <div className="mt-6 grid max-w-3xl gap-1 rounded-xl border bg-card px-4 py-3.5 text-[14px] leading-relaxed">
              <p className="font-medium">{t("sample.realTitle")}</p>
              <p className="text-muted-foreground">
                {t("sample.realBody")}{" "}
                <Link href="/#teardown" className="font-medium text-foreground underline underline-offset-4">
                  {t("sample.realLink")}
                </Link>
              </p>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/login/">
                  {t("sample.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/#pricing">{t("common.seePricing")}</Link>
              </Button>
            </div>
          </div>
        </section>
        <section className="py-12 md:py-16 print:py-0">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <ReportViewer data={data} sample />
            <p className="mt-10 text-[12.5px] leading-relaxed text-faint">{t("sample.badgeTip")}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
