"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlanCards } from "@/components/pricing-cards";
import { track } from "@/lib/track";
import { useI18n, usePageMeta } from "@/i18n/provider";

const RISK_REVERSAL = ["pricing.r1", "pricing.r2", "pricing.r3", "pricing.r4"];

export function PricingContent() {
  const { t } = useI18n();
  usePageMeta("meta.title.pricing", "meta.desc.pricing");

  useEffect(() => {
    track("pricing_view");
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--accent),transparent)]"
            aria-hidden
          />
          <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-16 text-center sm:px-6 md:pt-20">
            <h1 className="font-display text-4xl font-bold tracking-tight text-balance">{t("nav.pricing")}</h1>
            <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t("pricing.body")}</p>
          </div>
        </section>

        <section className="pb-16">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <PlanCards />

            {/* Risk reversal */}
            <div className="mt-10 rounded-xl border bg-secondary/40 p-6 sm:p-8">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="size-5 text-primary" aria-hidden />
                <h2 className="font-display text-lg font-bold">{t("pricing.know")}</h2>
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {RISK_REVERSAL.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{t(r)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 space-y-3 text-center text-sm text-muted-foreground">
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
