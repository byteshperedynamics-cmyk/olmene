"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { CHECK_COUNT } from "@/lib/config";
import { useI18n } from "@/i18n/provider";
import { InView } from "../in-view";
import { Section, SectionHeader } from "./section";

/**
 * "Find it. Fix it. Prove it." — three steps, each with a small real-UI
 * vignette. The only motion: a green dot travelling the hairline that joins
 * them (RTL-mirrored).
 */
export function HomeLoop() {
  const { t } = useI18n();

  const steps = [
    { n: "01", title: "loop.s1.title", body: "loop.s1.body", visual: <ScanVignette /> },
    { n: "02", title: "loop.s2.title", body: "loop.s2.body", visual: <DiffVignette /> },
    { n: "03", title: "loop.s3.title", body: "loop.s3.body", visual: <VerifyVignette /> },
  ];

  return (
    <Section id="how-it-works">
      <SectionHeader eyebrow={t("common.howItWorks")} title={t("loop.title")} />

      <InView className="relative mt-12">
        {/* connecting hairline + travelling dot (desktop) */}
        <div aria-hidden className="absolute inset-x-0 top-0 hidden h-px overflow-hidden bg-line-strong md:block">
          <div className="o-anim absolute inset-0 animate-[o-travel-x_4.8s_var(--ease-out-expo)_infinite] rtl:[--o-dir:-1]">
            <span className="absolute end-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_2px_var(--glow)]" />
          </div>
        </div>

        <ol className="grid gap-10 md:grid-cols-3 md:gap-8 md:pt-8">
          {steps.map((s) => (
            <li key={s.n} className="relative grid min-w-0 content-start gap-4">
              <span aria-hidden className="absolute -top-8 start-0 hidden size-2.5 -translate-y-1/2 rounded-full border border-primary bg-background md:block" />
              <div className="relative grid h-28 place-items-center rounded-xl border bg-card px-4">{s.visual}</div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-faint">{s.n}</span>
                <h3 className="o-display text-2xl">{t(s.title)}</h3>
              </div>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{t(s.body, { n: CHECK_COUNT })}</p>
            </li>
          ))}
        </ol>
      </InView>
    </Section>
  );
}

function ScanVignette() {
  const { t } = useI18n();
  const rows: [string, boolean][] = [
    [t("loop.v1.a"), true],
    [t("loop.v1.b"), false],
    [t("loop.v1.c"), true],
  ];
  return (
    <ul className="grid w-full max-w-[220px] gap-1.5 font-mono text-[11.5px]" aria-hidden>
      {rows.map(([label, ok]) => (
        <li key={label} className="flex items-center gap-2">
          {ok ? (
            <Check className="size-3.5 text-primary" strokeWidth={2.5} />
          ) : (
            <X className="size-3.5 text-signal-rust" strokeWidth={2.5} />
          )}
          <span className={ok ? "text-muted-foreground" : "text-foreground"}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

function DiffVignette() {
  return (
    <div className="w-full max-w-[250px] overflow-hidden rounded-md border font-mono text-[11px] leading-[1.9]" dir="ltr" aria-hidden>
      <div className="truncate bg-diff-del px-2">
        <span className="text-signal-rust">− </span>&lt;title&gt;Acme&lt;/title&gt;
      </div>
      <div className="truncate bg-diff-add px-2">
        <span className="text-primary">+ </span>&lt;title&gt;Acme · Product analytics&lt;/title&gt;
      </div>
    </div>
  );
}

function VerifyVignette() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-hidden>
      <span className="font-display text-3xl text-faint line-through decoration-1">61</span>
      <ArrowRight className="size-4 text-faint rtl-flip" />
      <span className="font-display text-5xl text-primary">94</span>
      <span className="max-w-[6rem] font-mono text-[10px] uppercase leading-tight tracking-[0.1em] text-faint max-lg:basis-full max-lg:max-w-none max-lg:text-center">
        {t("scores.readiness")}
      </span>
    </div>
  );
}
