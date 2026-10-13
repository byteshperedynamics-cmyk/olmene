"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Quote, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECK_COUNT } from "@/lib/config";
import { useI18n } from "@/i18n/provider";
import { prefersReducedMotion } from "../in-view";
import { Eyebrow } from "../atoms";
import { Section, SectionHeader } from "./section";

// Teardown #001 — REAL, measured results of running Olmene on its own homepage.
// BEFORE: measured 2026-09-25 on the live site, by the 18-check engine of the
// time. AFTER: re-measured 2026-10-01, after the free audit moved to the
// 21-check pipeline. The numbers stay as measured; the switcher says which
// engine produced each.
const STATES = {
  before: { readiness: 89, passed: 13, total: 18 },
  after: { readiness: 98, passed: CHECK_COUNT, total: CHECK_COUNT },
};

/** The five fixes, each with its before and after line. */
const ITEMS: Array<{ before: string; after: string }> = [
  { before: "teardown.b1", after: "teardown.li1" },
  { before: "teardown.b2", after: "teardown.li2" },
  { before: "teardown.beforeFinding1", after: "teardown.li3" },
  { before: "teardown.beforeFinding2", after: "teardown.li4" },
  { before: "teardown.b5", after: "teardown.li5" },
];

export function Teardown() {
  const { t } = useI18n();
  const [view, setView] = useState<"before" | "after">("after");
  const s = STATES[view];

  return (
    <Section id="teardown">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr]">
        <div className="min-w-0">
          <SectionHeader eyebrow={t("teardown.label")} title={t("teardown.title")} lede={t("teardown.body")} />

          {/* @graph parser story: engineering transparency */}
          <div className="o-artifact mt-8 grid gap-3 rounded-2xl p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-tel-amber">{t("teardown.lessonTitle")}</p>
            <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-muted-foreground">{t("teardown.lesson")}</p>
            <pre dir="ltr" className="o-well overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
              <span className="text-faint">{"{"}</span> <span className="text-foreground">&quot;@context&quot;</span>: &quot;https://schema.org&quot;,{"\n"}
              {"  "}<span className="text-tel-emerald">&quot;@graph&quot;</span>: [ {"{"} &quot;@type&quot;: &quot;Organization&quot; {"}"}, {"{"} &quot;@type&quot;: &quot;WebApplication&quot; {"}"} ] <span className="text-faint">{"}"}</span>
            </pre>
          </div>

          <Button asChild size="xl" className="mt-7">
            <Link href="#free-diagnosis">
              {t("teardown.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
            </Link>
          </Button>
        </div>

        {/* Before / after switcher — measured, not invented */}
        <div className="o-artifact min-w-0 rounded-2xl p-5 sm:p-6">
          <div role="tablist" aria-label={t("teardown.label")} className="o-well relative grid grid-cols-2 rounded-xl p-1">
            <span
              aria-hidden
              className="absolute inset-y-1 start-1 w-[calc(50%-4px)] rounded-lg bg-chip shadow-[inset_0_1px_0_var(--edge-top)] transition-transform duration-[var(--dur-state)] ease-[var(--ease-out-expo)] rtl:[--o-dir:-1]"
              style={{ transform: view === "after" ? "translateX(calc(100% * var(--o-dir, 1)))" : "none" }}
            />
            {(["before", "after"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`relative z-[1] flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(v === "before" ? "teardown.before" : "teardown.after")}
                <span className={`o-readout-strong text-[12px] ${v === "before" ? "text-tel-amber" : "text-tel-emerald"}`}>
                  {STATES[v].readiness}/100
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-6">
            <Dial value={s.readiness} good={view === "after"} />
            <div className="grid min-w-0 gap-2">
              <p className="o-readout-strong text-[15px] text-foreground">{t("form.checksPassed", { a: s.passed, b: s.total })}</p>
              <span className="inline-flex w-fit items-center rounded-full border border-rim bg-chip px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground">
                {view === "before" ? t("teardown.engine18") : t("teardown.engineTag")}
              </span>
              <p className="text-[12.5px] text-faint">{t("scores.readiness")}</p>
            </div>
          </div>

          <ul className="mt-6 grid gap-2 border-t border-edge pt-5 text-[13.5px] leading-relaxed" aria-live="polite">
            {ITEMS.map((it) => (
              <li key={it.after} className="flex items-start gap-2.5">
                {view === "after" ? (
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-tel-emerald/35 bg-tel-emerald/10 px-1.5 py-0.5 font-mono text-[10px] text-tel-emerald">
                    <CheckCircle2 className="size-3" aria-hidden /> {t("teardown.verified")}
                  </span>
                ) : (
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-tel-rose/35 bg-tel-rose/10 px-1.5 py-0.5 font-mono text-[10px] text-tel-rose">
                    <TriangleAlert className="size-3" aria-hidden /> {t("teardown.warning")}
                  </span>
                )}
                <span key={view} className="o-crossfade min-w-0 text-muted-foreground">
                  {t(view === "after" ? it.after : it.before)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Real output screenshot — also gives our image-alt check something to check */}
      <figure className="mt-12">
        {/* Light and dark captures of the same real result; the hidden one is display:none, so it neither loads nor is announced. */}
        <div className="o-artifact overflow-hidden rounded-2xl">
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
      <div className="o-artifact mt-10 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>{t("teardown.quotesLabel")}</Eyebrow>
          <span className="rounded-full border border-rim bg-chip px-2 py-0.5 font-mono text-[10px] text-faint">{t("teardown.engineTag")}</span>
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
    </Section>
  );
}

/** Readiness dial: the ring and the number move together when the view switches. */
function Dial({ value, good }: { value: number; good: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / 520);
      const e = 1 - Math.pow(1 - p, 3);
      const v = start + (value - start) * e;
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[112px] shrink-0 place-items-center" dir="ltr">
      <svg viewBox="-56 -56 112 112" className="absolute inset-0 size-full -rotate-90">
        <circle r={r} fill="none" stroke="var(--line-strong)" strokeWidth="7" />
        <circle
          r={r}
          fill="none"
          stroke={good ? "var(--tel-emerald)" : "var(--tel-amber)"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * shown) / 100} ${c}`}
          className="transition-[stroke] duration-[var(--dur-state)]"
        />
      </svg>
      <span className="o-readout-strong text-[30px] leading-none text-foreground">{Math.round(shown)}</span>
    </div>
  );
}
