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
import { ClientPagePreview } from "@/components/v2/home/agency-home";
import { useI18n, usePageMeta } from "@/i18n/provider";
import { track } from "@/lib/track";
import { TRIAL_DAYS } from "@/lib/trial/rules";
import { TrialForm } from "./trial-form";

function Feature({ icon: Icon, title, body }: { icon: typeof Check; title: string; body: string }) {
  return (
    <div className="grid content-start gap-2 rounded-xl border bg-card p-5">
      <h3 className="flex items-center gap-2.5 text-[16px] font-medium">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {title}
      </h3>
      <p className="text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
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
        {/* Hero: what agencies get, and the client page itself (example data) */}
        <section className="border-b border-edge">
          <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
            <div className="grid content-start gap-5">
              <Eyebrow>{t("biz.eyebrow")}</Eyebrow>
              <h1 className="o-display text-balance text-[36px] leading-[1.06] sm:text-[48px] lg:text-[56px]">{t("biz.title")}</h1>
              <p className="max-w-xl text-[17px] leading-relaxed text-muted-foreground">{t("biz.body", days)}</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="xl">
                  <a href="#trial">
                    {t("cta.agencyTrial")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </a>
                </Button>
                <Button asChild variant="hairline" size="xl">
                  <Link href="/pricing/">{t("biz.cta2")}</Link>
                </Button>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-muted-foreground">
                {["biz.fact1", "biz.fact2", "biz.fact3"].map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <Check className="size-4 text-muted-foreground" strokeWidth={2.5} aria-hidden />
                    {t(k, days)}
                  </li>
                ))}
              </ul>
            </div>
            <ClientPagePreview />
          </div>
        </section>

        {/* The trial, plainly: setup, timing, what's included, limits, what it needs, what happens after */}
        <Section id="how">
          <SectionHeader eyebrow={t("biz.how.label")} title={t("biz.how.title", days)} />
          <dl className="mt-10 grid overflow-hidden rounded-xl border md:grid-cols-2">
            {(["setup", "timing", "includes", "limits", "needs", "after"] as const).map((k) => (
              <div key={k} className="grid gap-1 border-b bg-card p-5 md:[&:nth-child(odd)]:border-e md:[&:nth-last-child(-n+2)]:border-b-0 [&:last-child]:border-b-0">
                <dt className="text-[13px] text-muted-foreground">{t(`biz.facts.${k}.t`)}</dt>
                <dd className="text-[15px] leading-relaxed">{t(`biz.facts.${k}.b`, days)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* What agencies deliver, and what every team gets */}
        <Section id="agencies" className="border-t border-edge">
          <SectionHeader eyebrow={t("biz.agency.label")} title={t("biz.agency.title")} />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Feature icon={Link2} title={t("biz.a1.t")} body={t("biz.a1.b")} />
            <Feature icon={Mail} title={t("biz.a2.t")} body={t("biz.a2.b")} />
            <Feature icon={Palette} title={t("biz.a3.t")} body={t("biz.a3.b")} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={UsersRound} title={t("biz.f1.t")} body={t("biz.f1.b")} />
            <Feature icon={GitPullRequest} title={t("biz.f2.t")} body={t("biz.f2.b")} />
            <Feature icon={ScrollText} title={t("biz.f3.t")} body={t("biz.f3.b")} />
            <Feature icon={RefreshCw} title={t("biz.f4.t")} body={t("biz.f4.b")} />
          </div>
        </Section>

        {/* The request: on phones the form comes straight after its heading, the questions after it. */}
        <Section id="trial" className="border-t border-edge" innerClassName="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8">
          <div className="grid content-start gap-4 lg:col-start-1 lg:row-start-1">
            <Eyebrow>{t("biz.eyebrow")}</Eyebrow>
            <h2 className="o-display text-[30px] leading-[1.08] sm:text-[38px]">{t("trial.title")}</h2>
            <p className="text-[17px] leading-relaxed text-muted-foreground">{t("trial.lede")}</p>
          </div>
          <div className="relative self-start rounded-xl border bg-card p-5 sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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
