"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Quote, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECK_COUNT } from "@/lib/config";
import { useI18n } from "@/i18n/provider";
import { Eyebrow } from "../atoms";
import { Section, SectionHeader } from "./section";

// Teardown #001 — REAL, measured results of running Olmene on its own homepage.
// BEFORE: measured 2026-09-25 on the live site. AFTER: re-measured 2026-10-01
// after the free audit synced to the 21-check pipeline.
const BEFORE = { readiness: 89, checksA: 13, checksB: 18 };
const AFTER = { readiness: 98, checksA: CHECK_COUNT, checksB: CHECK_COUNT };

export function Teardown() {
  const { t } = useI18n();
  return (
    <Section id="teardown">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHeader eyebrow={t("teardown.label")} title={t("teardown.title")} lede={t("teardown.body")} />
          <ul className="mt-6 grid gap-2.5 text-[14.5px]">
            {["teardown.li1", "teardown.li2", "teardown.li3", "teardown.li4", "teardown.li5"].map((k) => (
              <li key={k} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[14.5px] leading-relaxed text-muted-foreground">{t("teardown.lesson")}</p>
          <Button asChild size="xl" className="mt-7">
            <Link href="#free-diagnosis">
              {t("teardown.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
            </Link>
          </Button>
        </div>

        {/* Before / after — measured, not invented */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreCard
            label={t("teardown.before")}
            value={BEFORE.readiness}
            checks={t("form.checksPassed", { a: BEFORE.checksA, b: BEFORE.checksB })}
            items={[t("teardown.beforeFinding1"), t("teardown.beforeFinding2")]}
            tone="before"
            readiness={t("scores.readiness")}
          />
          <ScoreCard
            label={t("teardown.after")}
            value={AFTER.readiness}
            checks={t("form.checksPassed", { a: AFTER.checksA, b: AFTER.checksB })}
            items={[t("teardown.afterLi1"), t("teardown.afterLi2")]}
            tone="after"
            readiness={t("scores.readiness")}
          />
        </div>
      </div>

      {/* Real output screenshot — also gives our image-alt check something to check */}
      <figure className="mt-12">
        {/* Light and dark captures of the same real result; the hidden one is display:none, so it neither loads nor is announced. */}
        <div className="o-elevated overflow-hidden rounded-2xl bg-card">
          {(["", "-dark"] as const).map((v) => (
            <img
              key={v || "light"}
              src={`/img/teardown-001-diagnosis${v}-768.webp`}
              srcSet={[480, 768, 1064].map((w) => `/img/teardown-001-diagnosis${v}-${w}.webp ${w}w`).join(", ")}
              sizes="(min-width: 1152px) 1104px, calc(100vw - 32px)"
              alt={t("teardown.screenshotAlt", { n: CHECK_COUNT })}
              className={`w-full ${v ? "hidden dark:block" : "dark:hidden"}`}
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
      <div className="mt-10 rounded-2xl border bg-card p-6 sm:p-8">
        <Eyebrow>{t("teardown.quotesLabel")}</Eyebrow>
        <ul className="mt-5 grid gap-4 text-[14.5px] leading-relaxed">
          {[
            { quote: "teardown.q1", note: "teardown.q1note" },
            { quote: "teardown.q2", note: "teardown.q2note" },
            { quote: "teardown.q3", note: "teardown.q3note" },
          ].map((r) => (
            <li key={r.quote} className="flex gap-3">
              <Quote className="mt-1 size-4 shrink-0 text-primary rtl-flip" aria-hidden />
              <span>
                <span className="italic text-muted-foreground">&ldquo;{t(r.quote)}&rdquo;</span>{" "}
                <span>{t(r.note)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[14px] text-muted-foreground">
          {t("teardown.paidLayerPre")}{" "}
          <Link href="/sample-report/" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
            {t("teardown.paidLayerLink")}
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}

function ScoreCard({
  label,
  value,
  checks,
  items,
  tone,
  readiness,
}: {
  label: string;
  value: number;
  checks: string;
  items: string[];
  tone: "before" | "after";
  readiness: string;
}) {
  const after = tone === "after";
  return (
    <div className={`rounded-2xl border p-5 ${after ? "border-primary/35 bg-leaf-soft" : "bg-card"}`}>
      <p className={`font-mono text-[11px] uppercase tracking-[0.12em] ${after ? "text-primary" : "text-faint"}`}>{label}</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className={`font-display text-6xl font-medium leading-none ${after ? "text-primary" : "score-mid"}`}>{value}</span>
        <span className="whitespace-nowrap pb-1 text-xs text-muted-foreground">{readiness}</span>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">{checks}</p>
      <ul className="mt-4 grid gap-2 border-t pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            {after ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 score-mid" aria-hidden />
            )}
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
