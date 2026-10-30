"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlanGrid } from "@/components/v2/pricing/plan-grid";
import { TrialBand } from "@/components/business/trial-band";
import type { Plan } from "@/lib/data";
import { Eyebrow } from "@/components/v2/atoms";
import { track } from "@/lib/track";
import { useI18n, usePageMeta } from "@/i18n/provider";

const RISK_REVERSAL = ["pricing.r5", "pricing.r1", "pricing.r3", "pricing.r4"];

export function PricingContent({ initialPlans }: { initialPlans?: Plan[] } = {}) {
  const { t } = useI18n();
  usePageMeta("meta.title.pricing", "meta.desc.pricing");

  useEffect(() => {
    track("pricing_view");
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section>
          <div className="mx-auto grid w-full max-w-3xl justify-items-center gap-4 px-4 pb-10 pt-12 text-center sm:px-6 md:pb-12 md:pt-16">
            <Eyebrow>{t("nav.pricing")}</Eyebrow>
            <h1 className="o-display text-[34px] leading-[1.08] sm:text-[44px]">{t("home.plans.title")}</h1>
            <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{t("home.plans.lede")}</p>
          </div>
        </section>

        <section className="pb-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <PlanGrid initialPlans={initialPlans} />

            <TrialBand className="mt-10" />

            {/* Risk reversal */}
            <div className="mt-10 grid gap-6 rounded-xl border bg-card p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <h2 className="o-display text-xl">{t("pricing.know")}</h2>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {RISK_REVERSAL.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-[14px]">
                    <Check className="mt-0.5 size-4 shrink-0 text-tel-emerald" aria-hidden />
                    <span>{t(r)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 space-y-3 text-center text-[13px] text-muted-foreground">
              <p>{t("pricing.polar")}</p>
              <p>
                {t("pricing.q.pre")}{" "}
                <Link href="/sample-report/" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                  {t("pricing.q.link")}
                </Link>{" "}
                {t("pricing.q.post")}
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
