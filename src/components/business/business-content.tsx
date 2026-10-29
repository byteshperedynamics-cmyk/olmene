"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Check, GitPullRequest, Link2, Mail, Palette, RefreshCw, ScrollText, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Eyebrow } from "@/components/v2/atoms";
import { Section, SectionHeader } from "@/components/v2/home/section";
import { useI18n, usePageMeta } from "@/i18n/provider";
import { track } from "@/lib/track";
import { TRIAL_DAYS } from "@/lib/trial/rules";
import { TrialForm } from "./trial-form";

function Feature({ icon: Icon, title, body }: { icon: typeof Check; title: string; body: string }) {
  return (
    <div className="o-artifact grid content-start gap-3 rounded-2xl p-6">
      <span className="grid size-10 place-items-center rounded-xl border border-rim bg-chip">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * /business/: Olmene for companies and agencies, and the free-trial request
 * (14 days of the Agency plan, set up by hand within one working day). Every feature
 * named here exists in the product today; the copy is in the dictionaries.
 */
export function BusinessContent() {
  const { t } = useI18n();
  const days = { days: TRIAL_DAYS };
  usePageMeta("meta.title.business", "meta.desc.business");

  useEffect(() => {
    track("business_view");
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="o-grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(70%_80%_at_50%_0%,black,transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_0%,var(--leaf-soft),transparent)]"
          />
          <div className="mx-auto grid w-full max-w-3xl justify-items-center gap-5 px-4 pb-14 pt-12 text-center sm:px-6 md:pb-20 md:pt-20">
            <Eyebrow>{t("biz.eyebrow")}</Eyebrow>
            <h1 className="o-display text-balance text-[38px] leading-[1.04] sm:text-[56px]">{t("biz.title")}</h1>
            <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-[18px]">{t("biz.body", days)}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button asChild variant="sheen" size="xl">
                <a href="#trial">{t("biz.cta")}</a>
              </Button>
              <Button asChild variant="hairline" size="xl">
                <Link href="/pricing/">{t("biz.cta2")}</Link>
              </Button>
            </div>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] text-muted-foreground">
              {["biz.fact1", "biz.fact2", "biz.fact3"].map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <Check className="size-4 text-tel-emerald" strokeWidth={2.5} aria-hidden />
                  {t(k, days)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* For every team */}
        <Section id="teams" className="border-t border-edge">
          <SectionHeader eyebrow={t("biz.team.label")} title={t("biz.team.title")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={UsersRound} title={t("biz.f1.t")} body={t("biz.f1.b")} />
            <Feature icon={GitPullRequest} title={t("biz.f2.t")} body={t("biz.f2.b")} />
            <Feature icon={ScrollText} title={t("biz.f3.t")} body={t("biz.f3.b")} />
            <Feature icon={RefreshCw} title={t("biz.f4.t")} body={t("biz.f4.b")} />
          </div>
        </Section>

        {/* For agencies */}
        <Section id="agencies" className="border-t border-edge">
          <SectionHeader eyebrow={t("biz.agency.label")} title={t("biz.agency.title")} />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Feature icon={Link2} title={t("biz.a1.t")} body={t("biz.a1.b")} />
            <Feature icon={Mail} title={t("biz.a2.t")} body={t("biz.a2.b")} />
            <Feature icon={Palette} title={t("biz.a3.t")} body={t("biz.a3.b")} />
          </div>
        </Section>

        {/* How the trial works */}
        <Section id="how" className="border-t border-edge">
          <SectionHeader eyebrow={t("biz.how.label")} title={t("biz.how.title", days)} />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {(["s1", "s2", "s3"] as const).map((s, i) => (
              <li key={s} className="o-well grid content-start gap-3 rounded-2xl p-6">
                <span className="o-readout-strong text-[13px] text-muted-foreground">0{i + 1}</span>
                <h3 className="text-[17px] font-semibold">{t(`biz.${s}.t`)}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">{t(`biz.${s}.b`, days)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-[15px] text-muted-foreground">{t("biz.after", days)}</p>
        </Section>

        {/* The request: on phones the form comes straight after its heading, the questions after it. */}
        <Section id="trial" className="border-t border-edge" innerClassName="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8">
          <div className="grid content-start gap-4 lg:col-start-1 lg:row-start-1">
            <Eyebrow>{t("biz.eyebrow")}</Eyebrow>
            <h2 className="o-display text-[34px] leading-[1.04] sm:text-[44px]">{t("trial.title")}</h2>
            <p className="text-[17px] leading-relaxed text-muted-foreground">{t("trial.lede")}</p>
          </div>
          <div className="o-artifact relative self-start rounded-[22px] p-5 sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <TrialForm />
          </div>
          <Accordion type="single" collapsible className="min-w-0 lg:col-start-1 lg:row-start-2">
            {["1", "5", "2", "3", "4"].map((n) => (
              <AccordionItem key={n} value={`biz-faq-${n}`}>
                <AccordionTrigger className="text-start text-[16px] font-medium">{t(`biz.faq.q${n}`, days)}</AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`biz.faq.a${n}`, days)}
                  {n === "4" && (
                    <span className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                      <Link href="/#free-diagnosis" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4">
                        {t("nf.scan")} <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
                      </Link>
                      <Link href="/sample-report/" className="font-medium text-foreground underline underline-offset-4">
                        {t("nav.sampleReport")}
                      </Link>
                    </span>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
