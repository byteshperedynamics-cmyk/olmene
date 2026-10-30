"use client";

import Link from "next/link";
import { ChevronDown, Quote } from "lucide-react";
import { CHECK_COUNT } from "@/lib/config";
import { useI18n } from "@/i18n/provider";
import { Eyebrow } from "../atoms";
import { Section, SectionHeader } from "./section";

// Teardown #001: REAL, measured results of running Olmene on its own homepage.
// FINDING: measured 2026-09-25 on the live site by the 18-check engine of the
// time. VERIFICATION: re-measured 2026-10-01, after the free audit moved to
// the 21-check pipeline. The numbers stay as measured. Because the check sets
// differ, the case never presents 89 → 98 as a like-for-like gain; what
// compares directly is the five findings, each failing then passing.
const FINDING = { date: "2026-09-25", readiness: 89, passed: 13, total: 18 };
const VERIFIED = { date: "2026-10-01", readiness: 98, passed: CHECK_COUNT, total: CHECK_COUNT };

/** The five findings and the change that answered each. */
const ITEMS: Array<{ before: string; after: string }> = [
  { before: "teardown.b1", after: "teardown.li1" },
  { before: "teardown.b2", after: "teardown.li2" },
  { before: "teardown.beforeFinding1", after: "teardown.li3" },
  { before: "teardown.beforeFinding2", after: "teardown.li4" },
  { before: "teardown.b5", after: "teardown.li5" },
];

/**
 * One end-to-end case (refinement 2026-10-30): finding → change → live
 * verification, on olmene.com itself. The primary public evidence: dated
 * measurements, the engine that produced each, and a plain note on what can
 * and can't be compared. Raw output and report quotes sit one click away.
 */
export function Teardown() {
  const { t, lang } = useI18n();
  const date = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
    } catch {
      return iso;
    }
  };

  return (
    <Section id="teardown">
      <SectionHeader eyebrow={t("case.label")} title={t("case.title")} lede={t("case.lede")} />

      <ol className="mt-10 grid gap-4 lg:grid-cols-3">
        <li className="grid content-start gap-4 rounded-xl border bg-card p-5">
          <StepHead n={1} title={t("case.s1.title")} meta={`${date(FINDING.date)} · ${t("teardown.engine18")}`} />
          <p className="text-[14px]">
            {t("cp.score")} <span className="o-readout-strong text-foreground">{FINDING.readiness}/100</span>
            <span className="text-muted-foreground"> · {t("form.checksPassed", { a: FINDING.passed, b: FINDING.total })}</span>
          </p>
          <ul className="grid gap-2 border-t pt-4 text-[13.5px] leading-relaxed text-muted-foreground">
            {ITEMS.map((it) => (
              <li key={it.before} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-tel-rose" aria-hidden />
                <span>{t(it.before)}</span>
              </li>
            ))}
          </ul>
        </li>

        <li className="grid content-start gap-4 rounded-xl border bg-card p-5">
          <StepHead n={2} title={t("case.s2.title")} meta={t("case.s2.meta")} />
          <ul className="grid gap-2 text-[13.5px] leading-relaxed">
            {ITEMS.map((it) => (
              <li key={it.after} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{t(it.after)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 border-t pt-4">
            <p className="text-[13px] font-medium">{t("teardown.lessonTitle")}</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t("teardown.lesson")}</p>
          </div>
        </li>

        <li className="grid content-start gap-4 rounded-xl border bg-card p-5">
          <StepHead n={3} title={t("case.s3.title")} meta={`${date(VERIFIED.date)} · ${t("case.engine21", { n: CHECK_COUNT })}`} />
          <p className="text-[14px]">
            {t("cp.score")} <span className="o-readout-strong text-foreground">{VERIFIED.readiness}/100</span>
            <span className="text-muted-foreground"> · {t("form.checksPassed", { a: VERIFIED.passed, b: VERIFIED.total })}</span>
          </p>
          <p className="flex gap-2 border-t pt-4 text-[13.5px] leading-relaxed">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-tel-emerald" aria-hidden />
            <span>{t("case.s3.body")}</span>
          </p>
        </li>
      </ol>

      <div className="mt-4 grid gap-2 rounded-xl border border-tel-amber/35 bg-tel-amber/[0.05] p-5 text-[14px] leading-relaxed">
        <p className="font-medium">{t("case.compare.title")}</p>
        <p className="text-muted-foreground">{t("case.compare.body")}</p>
        <p className="text-muted-foreground">
          {t("case.today")}{" "}
          <Link href="#free-diagnosis" className="font-medium text-foreground underline underline-offset-4">
            {t("case.todayLink")}
          </Link>
        </p>
      </div>

      {/* The raw scan result and the paid layer's findings: proof, one click away (progressive disclosure) */}
      <details className="o-disclosure group mt-8">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md border border-rim px-3.5 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-[var(--dur-state)] group-open:rotate-180" aria-hidden />
          {t("teardown.more")}
        </summary>
        {/* Real output screenshot — also gives our image-alt check something to check */}
        <figure className="mt-8">
          {/* Light and dark captures of the same real result; the hidden one is display:none, so it neither loads nor is announced.
              Shown in greyscale: the capture predates the monochrome design, the numbers are unchanged. */}
          <div className="overflow-hidden rounded-xl border">
            {(["", "-dark"] as const).map((v) => (
              <img
                key={v || "light"}
                src={`/img/teardown-001-diagnosis${v}-768.webp`}
                srcSet={[480, 768, 1064].map((w) => `/img/teardown-001-diagnosis${v}-${w}.webp ${w}w`).join(", ")}
                sizes="(min-width: 1152px) 1104px, calc(100vw - 32px)"
                alt={t("teardown.screenshotAlt", { n: CHECK_COUNT })}
                className={`w-full grayscale contrast-[1.05] ${v ? "hidden dark:block" : "dark:hidden"}`}
                width={1064}
                height={478}
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
          <figcaption className="mt-3 text-center font-mono text-[11px] text-faint">
            {t("teardown.figcaption", { n: CHECK_COUNT })}
          </figcaption>
        </figure>

        {/* What the paid layer found — real quotes from our own full report */}
        <div className="mt-8 rounded-xl border bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>{t("teardown.quotesLabel")}</Eyebrow>
            <span className="text-[12.5px] text-muted-foreground">{t("teardown.engineTag")}</span>
          </div>
          <ul className="mt-5 grid gap-4 text-[14.5px] leading-relaxed">
            {[
              { quote: "teardown.q1", note: "teardown.q1note" },
              { quote: "teardown.q2", note: "teardown.q2note" },
              { quote: "teardown.q3", note: "teardown.q3note" },
            ].map((r) => (
              <li key={r.quote} className="flex gap-3">
                <Quote className="mt-1 size-4 shrink-0 text-faint rtl-flip" aria-hidden />
                <span>
                  <span className="text-muted-foreground">&ldquo;{t(r.quote)}&rdquo;</span> <span>{t(r.note)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[14px] text-muted-foreground">
            {t("teardown.paidLayerPre")}{" "}
            <Link href="/sample-report/" className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
              {t("teardown.paidLayerLink")}
            </Link>
            .
          </p>
        </div>
      </details>
    </Section>
  );
}

function StepHead({ n, title, meta }: { n: number; title: string; meta: string }) {
  return (
    <div className="grid gap-1">
      <p className="flex items-baseline gap-2.5">
        <span className="o-readout-strong text-[12px] text-faint">{n}</span>
        <span className="text-[16px] font-medium">{title}</span>
      </p>
      <p className="text-[12.5px] text-muted-foreground">{meta}</p>
    </div>
  );
}
