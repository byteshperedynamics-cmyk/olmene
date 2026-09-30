"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Globe2,
  History,
  ListChecks,
  MessagesSquare,
  Quote,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandMark } from "@/components/brand-mark";
import { CHECK_COUNT } from "@/lib/config";
import { FreeAuditForm } from "@/components/free-audit-form";
import { PricingTeaser } from "@/components/pricing-cards";
import { DemoVideo } from "@/components/demo-video";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { Reveal } from "@/components/motion";
import { useI18n, Tx, usePageMeta } from "@/i18n/provider";

// Teardown #001 — REAL, measured results of running Olmene on its own homepage.
// BEFORE: measured 2026-09-25 on the live site. AFTER: re-measured after the fixes below shipped.
const TEARDOWN_BEFORE = {
  readiness: 89,
  checksA: 13,
  checksB: 18,
};
const TEARDOWN_AFTER = { readiness: 98, checksA: CHECK_COUNT, checksB: CHECK_COUNT }; // re-measured 2026-10-01 after the free audit synced to the 21-check pipeline (the teardown copy itself lifted conversion 90→94)

// Demo video: footage predates the Olmene rebrand — hidden until re-recorded.
const SHOW_DEMO = false;

// Proof strip — real, all-time numbers from the production database
// (free_audits / reports row counts; 18 = the deterministic checklist the
// free audit actually runs today, verified live 2026-10-01; 15 languages).
// Refresh periodically (or wire to the DB) as usage grows; never inflate.
const STATS = [
  { value: "73", label: "stats.audits" },
  { value: "198", label: "stats.sources" },
  { value: String(CHECK_COUNT), label: "stats.checks" },
  { value: "15", label: "stats.languages" },
] as const;

export default function HomePage() {
  const { t } = useI18n();
  usePageMeta("meta.title.home", "meta.desc.home");

  const HOW_IT_WORKS = [
    { icon: Globe2, title: "hiw.s1.title", body: "hiw.s1.body" },
    { icon: ScanSearch, title: "hiw.s2.title", body: "hiw.s2.body" },
    { icon: ClipboardCheck, title: "hiw.s3.title", body: "hiw.s3.body" },
  ];

  const WHATS_INSIDE = [
    { icon: TrendingUp, title: "inside.s1.title", body: "inside.s1.body" },
    { icon: Quote, title: "inside.s2.title", body: "inside.s2.body" },
    { icon: ShieldCheck, title: "inside.s3.title", body: "inside.s3.body" },
    { icon: FileSearch, title: "inside.s4.title", body: "inside.s4.body" },
    { icon: ListChecks, title: "inside.s5.title", body: "inside.s5.body" },
    { icon: BookOpenCheck, title: "inside.s6.title", body: "inside.s6.body" },
  ];

  const TRUST_CARDS = [
    { icon: Globe2, title: "trust.s1.title", body: "trust.s1.body" },
    { icon: FileSearch, title: "trust.s2.title", body: "trust.s2.body" },
    { icon: Quote, title: "trust.s3.title", body: "trust.s3.body" },
    { icon: ListChecks, title: "trust.s4.title", body: "trust.s4.body" },
  ];

  const COMPARISON = [
    { who: "compare.c1.who", pitch: "compare.c1.pitch", problem: "compare.c1.problem" },
    { who: "compare.c2.who", pitch: "compare.c2.pitch", problem: "compare.c2.problem" },
    { who: "compare.c3.who", pitch: "compare.c3.pitch", problem: "compare.c3.problem" },
  ];

  const FAQS = [
    { q: "faq.q1", a: "faq.a1" },
    { q: "faq.q2", a: "faq.a2" },
    { q: "faq.q3", a: "faq.a3" },
    { q: "faq.q4", a: "faq.a4" },
    { q: "faq.q5", a: "faq.a5" },
    { q: "faq.q6", a: "faq.a6" },
    { q: "faq.q7", a: "faq.a7" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {/* ── Hero: outcome-first, free diagnosis front and center ── */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_55%_at_50%_-8%,var(--accent),transparent)]"
            aria-hidden
          />
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 md:pb-24 md:pt-24">
            <h1
              className="hero-in max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight text-balance sm:text-5xl md:text-6xl"
              style={{ animationDelay: "0.05s" }}
            >
              <Tx k="hero.title" />
            </h1>
            <p
              className="hero-in mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-balance"
              style={{ animationDelay: "0.15s" }}
            >
              {t("hero.subtitle")}
            </p>

            <div className="hero-in mt-10 flex w-full flex-col items-center" style={{ animationDelay: "0.25s" }}>
              <div id="free-diagnosis" className="scroll-mt-24 w-full flex justify-center">
                <FreeAuditForm />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("hero.microcopy")}</p>
            </div>

            <div className="hero-in" style={{ animationDelay: "0.35s" }}>
              <PricingTeaser />
            </div>
          </div>
        </section>

        {/* ── Proof strip: the instrument, in real numbers ── */}
        <section aria-label={t("stats.label")} className="border-y border-border/60 bg-secondary/30">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4 md:py-12">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-4xl font-bold text-primary tabular-nums md:text-5xl">{s.value}</p>
                <p className="mx-auto mt-2 max-w-[16ch] text-sm leading-snug text-muted-foreground">{t(s.label)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Watch it work: real product demo video ──
            Hidden until re-recorded: the footage still shows the pre-rebrand
            product. Flip SHOW_DEMO after the new capture lands. */}
        {SHOW_DEMO && (
        <section id="demo" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal className="text-center">
              <p className="section-label">{t("demo.label")}</p>
              <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                {t("demo.title")}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t("demo.body")}</p>
            </Reveal>
            <Reveal className="mt-8" delay={0.1}>
              <DemoVideo
                src="/video/olmene-demo.mp4"
                poster="/video/olmene-demo-poster-dark-960.webp"
              />
            </Reveal>
          </div>
        </section>
        )}

        {/* ── The fine print, up front: can / cannot ── */}
        <section id="can-cannot" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal className="text-center">
              <p className="section-label">{t("cc.label")}</p>
              <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                {t("cc.title")}
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Reveal delay={0.08} className="h-full">
                <div className="h-full rounded-xl border border-primary/30 bg-primary/5 p-6">
                  <p className="font-display text-lg font-semibold text-primary">{t("cc.canTitle")}</p>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed">
                    {["cc.can1", "cc.can2", "cc.can3"].map((k) => (
                      <li key={k} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span>{t(k)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={0.16} className="h-full">
                <div className="h-full rounded-xl border bg-card p-6">
                  <p className="font-display text-lg font-semibold">{t("cc.cannotTitle")}</p>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {["cc.cannot1", "cc.cannot2", "cc.cannot3"].map((k) => (
                      <li key={k} className="flex items-start gap-2.5">
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>{t(k)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-border/60 bg-secondary/30 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="section-label">{t("common.howItWorks")}</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                {t("hiw.title")}
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {HOW_IT_WORKS.map((s, i) => (
                <Reveal key={s.title} delay={0.08 + i * 0.08} className="h-full">
                  <Card className="card-lift h-full border-border/70">
                    <CardHeader>
                      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                        <s.icon className="size-5" aria-hidden />
                      </span>
                      <CardTitle className="mt-3 font-display text-lg font-semibold">{t(s.title)}</CardTitle>
                      <CardDescription className="leading-relaxed">{t(s.body)}</CardDescription>
                    </CardHeader>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── What's inside a report ── */}
        <section id="whats-inside" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="section-label">{t("inside.label")}</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                {t("inside.title")}
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {WHATS_INSIDE.map((c, i) => (
                <Reveal key={c.title} delay={0.06 + (i % 3) * 0.08} className="h-full">
                  <div className="card-lift h-full rounded-xl border bg-card p-5 shadow-sm">
                    <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <c.icon className="size-4.5" aria-hidden />
                    </span>
                    <h3 className="mt-3 font-semibold">{t(c.title)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(c.body, { n: CHECK_COUNT })}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 text-center" delay={0.1}>
              <Button asChild variant="outline" size="lg" className="w-full justify-center px-4 sm:w-auto">
                <Link href="/sample-report/">
                  {t("inside.seeAll")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
            </Reveal>
          </div>
        </section>

        {/* ── The "aha": a real diagnosis, shown ── */}
        <section className="border-y border-border/60 bg-secondary/30 py-16 md:py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <p className="section-label">{t("firstmin.label")}</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                {t("firstmin.title")}
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">{t("firstmin.body")}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {["firstmin.li1", "firstmin.li2", "firstmin.li3", "firstmin.li4"].map((k) => (
                  <li key={k} className="flex items-start gap-2.5">
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-primary rtl-flip" aria-hidden />
                    <span>{t(k, { n: CHECK_COUNT })}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Example diagnosis card — illustrative, same format as the real one */}
            <Reveal delay={0.12}>
              <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("exdiag.title")}</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                    {t("form.checksPassed", { a: 13, b: CHECK_COUNT })}
                  </span>
                  <span className="rounded-full bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                    {t("form.highImpact", { n: 3 })}
                  </span>
                </div>
              </div>
              <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
                <div className="grid place-items-center">
                  <ScoreRing value={54} size={112} label={t("scores.readiness")} />
                </div>
                <div className="grid content-center gap-3">
                  <ScoreBar label={t("scores.seoTech")} value={68} />
                  <ScoreBar label={t("scores.messaging")} value={52} />
                  <ScoreBar label={t("scores.conversion")} value={41} />
                </div>
              </div>
              <div className="space-y-3 border-t px-5 py-5">
                <div className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sev-high rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                      {t("sev.high")}
                    </span>
                    <p className="font-medium">{t("exdiag.finding.title")}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{t("form.evidence")}</span>
                    {t("exdiag.finding.evidence")}
                  </p>
                  <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                      {t("exdiag.impactLabel")}{" "}
                    </span>
                    {t("exdiag.impactBody")}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("common.biggestOpportunity")}</p>
                  <p className="mt-1 font-medium">{t("exdiag.opportunityTitle")}</p>
                </div>
                <p className="text-sm text-muted-foreground">{t("exdiag.more")}</p>
              </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Why trust Olmene ── */}
        <section className="py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="section-label">{t("trust.label")}</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                {t("trust.title")}
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_CARDS.map((c, i) => (
                <Reveal key={c.title} delay={0.06 + (i % 4) * 0.07} className="h-full">
                  <div className="card-lift h-full rounded-xl border bg-card p-5 shadow-sm">
                    <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <c.icon className="size-4.5" aria-hidden />
                    </span>
                    <h3 className="mt-3 font-semibold">{t(c.title)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(c.body, { n: CHECK_COUNT })}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Teardown #001: real proof — we ran Olmene on Olmene ── */}
        <section id="teardown" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal>
                <p className="section-label">{t("teardown.label")}</p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                  {t("teardown.title")}
                </h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">{t("teardown.body")}</p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {["teardown.li1", "teardown.li2", "teardown.li3", "teardown.li4", "teardown.li5"].map((k) => (
                    <li key={k} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 score-good" aria-hidden />
                      <span>{t(k)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("teardown.lesson")}</p>
                <Button asChild size="lg" className="mt-6">
                  <Link href="#free-diagnosis">
                    {t("teardown.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              </Reveal>

              {/* Before / after — measured, not invented */}
              <Reveal delay={0.12}>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("teardown.before")}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-5xl font-bold score-mid">{TEARDOWN_BEFORE.readiness}</span>
                    <span className="pb-1.5 text-xs text-muted-foreground">{t("scores.readiness")}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {t("form.checksPassed", { a: TEARDOWN_BEFORE.checksA, b: TEARDOWN_BEFORE.checksB })}
                  </p>
                  <ul className="mt-4 space-y-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    {["teardown.beforeFinding1", "teardown.beforeFinding2"].map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 score-mid" aria-hidden />
                        <span>{t(k)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary">{t("teardown.after")}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-5xl font-bold score-good">{TEARDOWN_AFTER.readiness}</span>
                    <span className="pb-1.5 text-xs text-muted-foreground">{t("scores.readiness")}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {t("form.checksPassed", { a: TEARDOWN_AFTER.checksA, b: TEARDOWN_AFTER.checksB })}
                  </p>
                  <ul className="mt-4 space-y-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    {["teardown.afterLi1", "teardown.afterLi2"].map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 score-good" aria-hidden />
                        <span>{t(k)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                </div>
              </Reveal>
            </div>

            {/* Real output screenshot — also gives our image-alt check something to check */}
            <Reveal className="mt-10">
              <figure className="mt-0">
              <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
                <img
                  src="/img/teardown-001-diagnosis-768.webp"
                  srcSet="/img/teardown-001-diagnosis-480.webp 480w, /img/teardown-001-diagnosis-768.webp 768w, /img/teardown-001-diagnosis-1064.webp 1064w"
                  sizes="(min-width: 1024px) 532px, (min-width: 640px) 768px, calc(100vw - 32px)"
                  alt={t("teardown.screenshotAlt", { n: CHECK_COUNT })}
                  className="w-full"
                  width={768}
                  height={279}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="mt-3 text-center text-xs text-muted-foreground">
                {t("teardown.figcaption", { n: CHECK_COUNT })}
              </figcaption>
            </figure>
            </Reveal>

            {/* What the paid layer found — real quotes from our own full report */}
            <Reveal className="mt-8">
              <div className="mt-0 rounded-xl border bg-secondary/30 p-6 sm:p-8">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("teardown.quotesLabel")}
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed">
                {[
                  { quote: "teardown.q1", note: "teardown.q1note" },
                  { quote: "teardown.q2", note: "teardown.q2note" },
                  { quote: "teardown.q3", note: "teardown.q3note" },
                ].map((r) => (
                  <li key={r.quote} className="flex gap-3">
                    <Quote className="mt-1 size-4 shrink-0 text-primary rtl-flip" aria-hidden />
                    <span>
                      <span className="italic text-muted-foreground">&ldquo;{t(r.quote)}&rdquo;</span>{" "}
                      <span className="text-foreground">{t(r.note)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("teardown.paidLayerPre")}{" "}
                <Link href="/sample-report/" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
                  {t("teardown.paidLayerLink")}
                </Link>
                .
              </p>
            </div>
            </Reveal>
          </div>
        </section>

        {/* ── Comparison: the enemy is generic advice ── */}
        <section className="border-y border-border/60 bg-secondary/30 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="section-label">{t("compare.label")}</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance">
                <Tx k="compare.title" />
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {COMPARISON.map((c, i) => (
                <Reveal key={c.who} delay={0.08 + i * 0.08} className="h-full">
                  <div className="flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm">
                    <p className="text-sm font-semibold text-muted-foreground">{t(c.who)}</p>
                    <p className="mt-2 font-display text-lg font-semibold italic">&ldquo;{t(c.pitch)}&rdquo;</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(c.problem)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-6" delay={0.15}>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">Olmene</p>
                <p className="mt-2 font-display text-xl font-semibold leading-snug text-balance sm:text-2xl">
                  &ldquo;{t("compare.ours")}&rdquo;
                </p>
              </div>
            </Reveal>
            {/* One concrete, checkable example — assertion becomes proof. */}
            <Reveal className="mt-6" delay={0.22}>
              <div className="rounded-xl border bg-card p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                  {t("compare.proofLabel")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("compare.proofBody")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Report teaser ── */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <p className="section-label">{t("rt.label")}</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                {t("rt.title")}
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">{t("rt.body")}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {["rt.li1", "rt.li2", "rt.li3", "rt.li4", "rt.li5"].map((k) => (
                  <li key={k} className="flex items-start gap-2.5">
                    <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
              <div className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-2.5">
                <BrandMark size={14} className="text-primary" />
                <span className="font-mono text-xs text-muted-foreground">{t("rt.previewLabel")}</span>
              </div>
              <div className="space-y-4 p-6">
                <div className="flex items-end gap-3">
                  <span className="font-display text-5xl font-bold score-mid">61</span>
                  <span className="pb-1.5 text-sm text-muted-foreground">{t("rt.overall")}</span>
                </div>
                <div className="grid gap-3">
                  <ScoreBar label={t("scores.messagingShort")} value={58} />
                  <ScoreBar label={t("scores.conversionShort")} value={48} />
                  <ScoreBar label={t("scores.seoShort")} value={72} />
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("common.biggestOpportunity")}</p>
                  <p className="mt-1 text-sm leading-relaxed">{t("rt.opportunityBody")}</p>
                  <p className="mt-2 block text-xs text-muted-foreground">{t("rt.fromSample")}</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["4", "rt.days7"],
                    ["4", "rt.days30"],
                    ["3", "rt.days60"],
                    ["3", "rt.days90"],
                  ].map(([n, l]) => (
                    <div key={l} className="rounded-lg border bg-background p-2">
                      <div className="font-display text-xl font-bold">{n}</div>
                      <div className="text-[11px] text-muted-foreground">{t(l)}</div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Pricing teaser ── */}
        <section id="pricing-teaser" className="scroll-mt-20 border-y border-border/60 bg-secondary/30 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6">
            <Reveal>
              <p className="section-label">{t("nav.pricing")}</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                {t("ph.title")}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t("ph.body")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="#free-diagnosis">
                    {t("ph.cta.outcome")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/pricing/">{t("common.seePricing")}</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/sample-report/">{t("common.readSample")}</Link>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">{t("ph.microcopy")}</p>
            </Reveal>
          </div>
        </section>

        {/* ── Retention: why you'll still need this in six months ── */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
            <Reveal>
              <p className="section-label">{t("retain.label")}</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                {t("retain.title")}
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">{t("retain.body")}</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {["retain.li1", "retain.li2", "retain.li3"].map((k) => (
                  <li key={k} className="flex items-start gap-2.5">
                    <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <History className="size-4" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">{t("retain.history")}</span>
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  { m: "retain.month.sep", v: 54, bar: "bg-score-mid", text: "score-mid" },
                  { m: "retain.month.oct", v: 68, bar: "bg-score-mid", text: "score-mid" },
                  { m: "retain.month.nov", v: 81, bar: "bg-score-good", text: "score-good" },
                ].map((r) => (
                  <div key={r.m} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground">{t(r.m)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${r.v}%` }} />
                    </div>
                    <span className={`w-8 text-end font-display text-sm font-semibold ${r.text}`}>{r.v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t("retain.footnote")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-20 py-16 md:py-20">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <Reveal>
              <p className="section-label">{t("faq.label")}</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">
                {t("faq.title")}
              </h2>
            </Reveal>
            <Reveal className="mt-8" delay={0.08}>
              <Accordion type="single" collapsible>
                {FAQS.map((f, i) => (
                  <AccordionItem key={f.q} value={`faq-${i}`}>
                    <AccordionTrigger className="text-start text-base font-medium">{t(f.q)}</AccordionTrigger>
                    <AccordionContent className="leading-relaxed text-muted-foreground">{t(f.a)}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* ── Methodology ── */}
        <section className="border-t border-border/60 bg-secondary/30 py-14">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3">
            <div>
              <p className="section-label">{t("method.label")}</p>
              <h3 className="mt-2 font-display text-xl font-bold">{t("method.title")}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground md:col-span-2">
              {t("method.body")}
            </p>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
            <Reveal>
              <MessagesSquare className="mx-auto size-8 text-primary" aria-hidden />
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {t("cta.title")}
              </h2>
              <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">{t("cta.body")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/login/">
                    {t("common.getStarted")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#how-it-works">{t("common.howItWorks")}</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
