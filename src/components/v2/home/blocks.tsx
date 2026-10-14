"use client";

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FreeAuditInput } from "@/components/free-audit-form";
import { PlanGrid } from "../pricing/plan-grid";
import { CHECK_COUNT, FOUNDER_LINKEDIN, FOUNDER_NAME } from "@/lib/config";
import { useI18n, Tx } from "@/i18n/provider";
import { Eyebrow } from "../atoms";
import { Flower } from "../flower";
import { Section, SectionHeader } from "./section";

/* ── Can / cannot ─────────────────────────────────────────────────────── */

export function CanCannot() {
  const { t } = useI18n();
  return (
    <Section id="can-cannot">
      <SectionHeader eyebrow={t("cc.label")} title={t("cc.title")} lede={t("sec.control")} />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="o-artifact rounded-2xl p-6 sm:p-7">
          <p className="o-display text-xl">{t("cc.canTitle")}</p>
          <ul className="mt-5 grid gap-3.5 text-[15px]">
            {["cc.can1", "cc.can2", "cc.can3"].map((k) => (
              <li key={k} className="flex items-start gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-tel-emerald" strokeWidth={2.5} aria-hidden />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="o-well rounded-2xl p-6 sm:p-7">
          <p className="o-display text-xl">{t("cc.cannotTitle")}</p>
          <ul className="mt-5 grid gap-3.5 text-[15px] text-muted-foreground">
            {["cc.cannot1", "cc.cannot2", "cc.cannot3"].map((k) => (
              <li key={k} className="flex items-start gap-3">
                <X className="mt-0.5 size-4 shrink-0 text-tel-rose" strokeWidth={2.5} aria-hidden />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/security/#github" className="o-hit relative font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
          {t("cc.more")}
        </Link>
      </p>
    </Section>
  );
}

/* ── Who is behind Olmene (compact: a verifiable operator, no founder profile) ── */

export function AboutStudio() {
  const { t } = useI18n();
  return (
    <Section id="about" className="py-12 md:py-16">
      <div className="o-artifact grid gap-6 rounded-2xl p-6 sm:p-8 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div className="grid gap-3">
          <Eyebrow>{t("about.eyebrow")}</Eyebrow>
          <h2 className="o-display text-2xl leading-tight sm:text-3xl">{t("about.title")}</h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{t("about.p1")}</p>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{t("about.p2")}</p>
        </div>
        <div className="grid gap-2 text-sm md:justify-items-end md:text-end">
          <p className="text-muted-foreground">
            {t("about.founder")}: <span className="font-medium text-foreground">{FOUNDER_NAME}</span> ·{" "}
            <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
              LinkedIn
            </a>
          </p>
          <Link href="/security/" className="o-hit relative font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
            {t("about.security")}
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ── Comparison ───────────────────────────────────────────────────────── */

export function Comparison() {
  const { t } = useI18n();
  const rows = [
    { who: "compare.c1.who", pitch: "compare.c1.pitch", problem: "compare.c1.problem" },
    { who: "compare.c2.who", pitch: "compare.c2.pitch", problem: "compare.c2.problem" },
    { who: "compare.c3.who", pitch: "compare.c3.pitch", problem: "compare.c3.problem" },
  ];
  return (
    <Section className="border-y border-edge">
      <SectionHeader eyebrow={t("compare.label")} title={<Tx k="compare.title" />} />
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.who} className="o-well flex flex-col rounded-2xl p-6">
            <p className="text-[13px] text-faint font-medium">{t(r.who)}</p>
            <p className="o-display mt-3 text-xl">&ldquo;{t(r.pitch)}&rdquo;</p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{t(r.problem)}</p>
          </div>
        ))}
      </div>
      <div className="o-glow-border mt-4 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <Flower size={18} />
          <p translate="no" className="text-[13px] text-foreground font-medium">Olmene</p>
        </div>
        <p className="o-display mt-3 text-2xl leading-snug sm:text-[28px]">&ldquo;{t("compare.ours")}&rdquo;</p>
      </div>
      <div className="o-well mt-4 rounded-2xl p-6 sm:p-7">
        <Eyebrow>{t("compare.proofLabel")}</Eyebrow>
        <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">{t("compare.proofBody")}</p>
      </div>
    </Section>
  );
}

/* ── Pricing: the three ways in, on the homepage ─────────────────────── */

export function PricingBand() {
  const { t } = useI18n();
  return (
    <Section id="pricing" innerClassName="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <SectionHeader eyebrow={t("nav.pricing")} title={t("ph.title")} lede={t("ph.body")} />
        <Button asChild variant="hairline" className="w-fit">
          <Link href="/pricing/">
            {t("pc.home.more")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
          </Link>
        </Button>
      </div>
      <PlanGrid layout="home" />
    </Section>
  );
}

/* ── FAQ + methodology ────────────────────────────────────────────────── */

export function HomeFaq() {
  const { t } = useI18n();
  const faqs = ["1", "2", "3", "4", "5", "6", "7"];
  return (
    <Section id="faq" innerClassName="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="grid content-start gap-8">
        <SectionHeader eyebrow={t("faq.label")} title={t("faq.title")} />
        <div className="o-well hidden rounded-2xl p-6 lg:block">
          <Eyebrow>{t("method.label")}</Eyebrow>
          <p className="o-display mt-3 text-xl">{t("method.title")}</p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{t("method.body")}</p>
        </div>
      </div>
      <Accordion type="single" collapsible className="min-w-0">
        {faqs.map((n) => (
          <AccordionItem key={n} value={`faq-${n}`}>
            <AccordionTrigger className="text-start text-[16px] font-medium">{t(`faq.q${n}`)}</AccordionTrigger>
            <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
              {t(`faq.a${n}`, { n: CHECK_COUNT })}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

/* ── Final CTA ────────────────────────────────────────────────────────── */

export function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="relative isolate overflow-hidden border-t border-edge py-24 md:py-36">
      <div aria-hidden className="o-hero-backdrop pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid w-full max-w-3xl justify-items-center gap-6 px-4 text-center sm:px-6">
        <Flower size={40} variant="bloom" />
        <h2 className="o-display o-hero-title text-[40px] leading-[1.02] sm:text-[56px] lg:text-[64px]">{t("cta.title")}</h2>
        <p className="max-w-xl text-[17px] leading-relaxed text-muted-foreground">{t("cta.body")}</p>
        <FreeAuditInput variant="cta" className="mt-3" />
      </div>
    </section>
  );
}
