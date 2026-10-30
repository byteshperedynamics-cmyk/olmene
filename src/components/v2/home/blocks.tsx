"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PlanGrid } from "../pricing/plan-grid";
import { CHECK_COUNT } from "@/lib/config";
import { TRIAL_DAYS } from "@/lib/trial/rules";
import { useI18n } from "@/i18n/provider";
import { Section, SectionHeader } from "./section";

/* ── Plans: Agency first, Fix beside it, the single report apart ─────── */

export function HomePlans() {
  const { t } = useI18n();
  return (
    <Section id="pricing" innerClassName="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <SectionHeader eyebrow={t("nav.pricing")} title={t("home.plans.title")} lede={t("home.plans.lede")} />
        <Button asChild variant="hairline" className="w-fit">
          <Link href="/pricing/">
            {t("home.plans.more")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
          </Link>
        </Button>
      </div>
      <PlanGrid layout="home" />
      <p className="text-[14px] text-muted-foreground">
        {t("home.plans.free", { n: CHECK_COUNT })}{" "}
        <Link href="#free-diagnosis" className="font-medium text-foreground underline underline-offset-4">
          {t("pc.free.cta")}
        </Link>
      </p>
    </Section>
  );
}

/* ── FAQ: the questions agencies and developers ask before trying ───── */

export function HomeFaq() {
  const { t } = useI18n();
  const faqs = ["2", "3", "5", "6", "8"];
  return (
    <Section id="faq" innerClassName="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="grid content-start gap-4">
        <SectionHeader eyebrow={t("faq.label")} title={t("home.faq.title")} />
        <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">{t("method.body")}</p>
      </div>
      <Accordion type="single" collapsible className="min-w-0">
        {faqs.map((n) => (
          <AccordionItem key={n} value={`faq-${n}`}>
            <AccordionTrigger className="text-start text-[16px] font-medium">{t(`faq.q${n}`)}</AccordionTrigger>
            <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">{t(`faq.a${n}`, { n: CHECK_COUNT })}</AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="faq-trial">
          <AccordionTrigger className="text-start text-[16px] font-medium">{t("home.faq.trialQ")}</AccordionTrigger>
          <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
            {t("home.faq.trialA", { days: TRIAL_DAYS })}{" "}
            <Link href="/business/" className="font-medium text-foreground underline underline-offset-4">
              {t("home.faq.trialLink")}
            </Link>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Section>
  );
}
