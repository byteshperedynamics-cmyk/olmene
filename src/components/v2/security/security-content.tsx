"use client";

import Link from "next/link";
import { Check, Lock, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Section, SectionHeader } from "@/components/v2/home/section";
import { useI18n, Tx, usePageMeta } from "@/i18n/provider";
import { StudioMark } from "@/components/studio-mark";
import { FOUNDER_LINKEDIN, SECURITY_EMAIL } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useStage } from "@/components/v2/in-view";

/**
 * Security & trust — what the GitHub app can and cannot do, and how data is
 * handled. Every statement here mirrors the code: permissions from
 * api/agent/github/register (contents + pull_requests), GET/POST-only client
 * (lib/agent/allowlist), stored diffs (lib/agent/runner), retention (privacy
 * policy, free-audit prune cron). Change the code → change this page.
 */


const PERMISSIONS = ["p1", "p2", "p3"];

const CAPABILITIES: Array<{ key: string; yes: boolean }> = [
  { key: "c1", yes: true },
  { key: "c2", yes: true },
  { key: "c3", yes: true },
  { key: "c4", yes: false },
  { key: "c5", yes: false },
  { key: "c6", yes: false },
  { key: "c7", yes: false },
  { key: "c8", yes: false },
];

const DATA_ROWS = ["d1", "d2", "d3", "d4", "d5"];

/** Processors: role and the data each one receives (mirrors the privacy policy). */
const PROCESSORS = ["cloudflare", "supabase", "vertex", "tavily", "brevo", "polar", "github", "ga"];
const PROCESSOR_NAMES: Record<string, string> = {
  cloudflare: "Cloudflare",
  supabase: "Supabase",
  vertex: "Google Cloud Vertex AI",
  tavily: "Tavily",
  brevo: "Brevo",
  polar: "Polar",
  github: "GitHub",
  ga: "Google Analytics",
};

function Prose({ title, k, id }: { title: string; k: string; id?: string }) {
  const { t } = useI18n();
  return (
    <div id={id} className="o-artifact scroll-mt-24 rounded-2xl p-6 sm:p-7">
      <h3 className="o-display text-xl">{t(title)}</h3>
      <p className="mt-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        <Tx k={k} />
      </p>
    </div>
  );
}

export function SecurityContent() {
  const { t } = useI18n();
  usePageMeta("meta.title.security", "meta.desc.security");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <Section className="pb-8 md:pb-10">
          <SectionHeader eyebrow={t("sec.eyebrow")} title={t("sec.h1")} />
          <p className="mt-6 max-w-2xl border-s-2 border-foreground ps-4 text-lg font-medium leading-relaxed sm:text-xl">
            {t("sec.control")}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">{t("sec.updated")}</p>
        </Section>

        {/* Workflow: the trust boundary */}
        <Section id="workflow" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.flow.title")}</h2>
          <TrustBoundary />
        </Section>

        {/* GitHub permissions */}
        <Section id="github" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.gh.title")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("sec.gh.lede")}</p>
          <div className="o-well mt-6 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[560px] text-start text-sm">
              <thead className="border-b border-edge text-[13px] text-faint font-medium">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colPerm")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colAccess")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colWhy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--edge)]">
                {PERMISSIONS.map((p) => (
                  <tr key={p} className="align-top">
                    <th scope="row" className="px-4 py-3 font-semibold">{t(`sec.gh.${p}`)}</th>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-tel-sky">{t(`sec.gh.${p}a`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t(`sec.gh.${p}w`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{t("sec.gh.none")}</p>
        </Section>

        {/* Capabilities: allowed vs blocked */}
        <Section id="capabilities" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.cap.title")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {([true, false] as const).map((yes) => (
              <div key={String(yes)} className={cn("rounded-2xl p-5 sm:p-6", yes ? "o-artifact" : "o-well")}>
                <p className={cn("flex items-center gap-2 text-[13px] font-medium", yes ? "text-tel-emerald" : "text-tel-rose")}>
                  {yes ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                  {t(yes ? "sec.cap.allowed" : "sec.cap.blocked")}
                </p>
                <ul className="mt-4 grid gap-4">
                  {CAPABILITIES.filter((c) => c.yes === yes).map((c) => (
                    <li key={c.key} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                          yes ? "border-tel-emerald/40 bg-tel-emerald/10 text-tel-emerald" : "border-tel-rose/40 bg-tel-rose/10 text-tel-rose",
                        )}
                      >
                        {yes ? <Check className="size-3" strokeWidth={3} aria-hidden /> : <X className="size-3" strokeWidth={3} aria-hidden />}
                        <span className="sr-only">{t(yes ? "sec.cap.yes" : "sec.cap.no")}</span>
                      </span>
                      <span className="grid gap-1">
                        <span className="font-medium leading-snug">{t(`sec.cap.${c.key}`)}</span>{" "}
                        <span className="text-sm leading-snug text-muted-foreground">{t(`sec.cap.${c.key}n`)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{t("sec.cap.enforced")}</p>
        </Section>

        {/* Control */}
        <Section className="py-8 md:py-10" innerClassName="grid gap-4 md:grid-cols-2">
          <Prose id="repositories" title="sec.repo.title" k="sec.repo.p" />
          <Prose id="production" title="sec.prod.title" k="sec.prod.p" />
          <Prose id="credentials" title="sec.tokens.title" k="sec.tokens.p" />
          <Prose id="safeguards" title="sec.safe.title" k="sec.safe.p" />
        </Section>

        {/* Data handling */}
        <Section id="data" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.data.title")}</h2>
          <div className="o-well mt-6 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="border-b border-edge text-[13px] text-faint font-medium">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colWhat")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colHow")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colKept")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--edge)]">
                {DATA_ROWS.map((d) => (
                  <tr key={d} className="align-top">
                    <th scope="row" className="px-4 py-3 font-semibold">{t(`sec.data.${d}`)}</th>
                    <td className="px-4 py-3 text-muted-foreground">{t(`sec.data.${d}h`)}</td>
                    <td className="px-4 py-3">{t(`sec.data.${d}k`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Prose title="sec.data.aiTitle" k="sec.data.aiP" />
            <Prose title="sec.data.delTitle" k="sec.data.delP" />
          </div>
          <div className="mt-10">
            <h3 id="processors" className="o-display scroll-mt-24 text-xl">{t("sec.data.subTitle")}</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROCESSORS.map((p) => (
                <li key={p} className="o-artifact grid content-start gap-2 rounded-xl p-4">
                  <p translate="no" className="font-medium">{PROCESSOR_NAMES[p]}</p>
                  <p className="text-[13px] tracking-[0.1em] text-faint font-medium">{t(`sec.proc.${p}.role`)}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{t(`sec.proc.${p}.data`)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/legal/privacy/" className="underline underline-offset-4 hover:text-foreground">
                {t("sec.data.more")}
              </Link>
            </p>
          </div>
        </Section>

        {/* Operator */}
        <Section id="operator" className="pt-8 md:pt-10">
          <div className="o-artifact max-w-2xl rounded-2xl p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <StudioMark size={32} className="shrink-0" />
              <h2 className="o-display text-xl">{t("sec.who.title")}</h2>
            </div>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t("sec.who.p")}</p>
            <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
                {t("sec.who.linkedin")}
              </a>
            </p>
            {SECURITY_EMAIL && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("sec.who.contact")}{" "}
                <a href={`mailto:${SECURITY_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
                  {SECURITY_EMAIL}
                </a>
              </p>
            )}
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * The 7-step flow on a visible boundary: Olmene's read-and-draft sandbox
 * (steps 1–4) on one side, your production boundary (5–6) on the other, and
 * the read-only re-check (7) after the merge. Steps light up once, in order,
 * when the diagram scrolls into view; reduced motion shows them lit.
 */
function TrustBoundary() {
  const { t } = useI18n();
  const [ref, stage] = useStage<HTMLDivElement>();
  const step = (key: string, i: number, you = false) => (
    <li
      key={key}
      className={cn("o-step flex flex-col gap-1.5 rounded-xl p-3.5", you ? "o-artifact" : "o-chip")}
      style={{ ["--d" as string]: `${i * 160}ms` }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="o-readout-strong text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>{" "}
        <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", you ? "border-foreground/40 text-foreground" : "border-rim text-muted-foreground")}>
          {t(you ? "sec.flow.you" : "sec.flow.olmene")}
        </span>
      </span>{" "}
      <span className="text-[14px] font-medium leading-snug">{t(`sec.flow.${key}`)}</span>{" "}
      <span className="text-[12.5px] leading-snug text-muted-foreground">{t(`sec.flow.${key}d`)}</span>
    </li>
  );
  return (
    <div ref={ref} data-stage={stage} className="o-boundary mt-6 grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_auto_1fr]">
        <div className="o-well rounded-2xl p-4 sm:p-5">
          <p className="text-[13px] text-faint font-medium">{t("sec.zone.olmene")}</p>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-muted-foreground">{t("sec.zone.olmeneNote")}</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">{["s1", "s2", "s3", "s4"].map((k, i) => step(k, i))}</ol>
        </div>
        <div aria-hidden className="relative hidden w-10 lg:block">
          <span className="absolute inset-y-2 start-1/2 -translate-x-1/2 border-s border-dashed border-foreground/35 rtl:translate-x-1/2" />
          <span className="o-chip absolute start-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full rtl:translate-x-1/2">
            <Lock className="size-3.5 text-foreground" />
          </span>
        </div>
        <div className="rounded-2xl border border-foreground/25 p-4 sm:p-5">
          <p className="text-[13px] text-foreground font-medium">{t("sec.zone.you")}</p>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-muted-foreground">{t("sec.zone.youNote")}</p>
          <ol start={5} className="mt-4 grid gap-3">{["s5", "s6"].map((k, i) => step(k, i + 4, true))}</ol>
        </div>
      </div>
      <div className="o-well flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:p-5">
        <p className="shrink-0 text-[13px] text-faint sm:w-64 font-medium">{t("sec.zone.after")}</p>
        <ol start={7} className="grid flex-1">{step("s7", 6)}</ol>
      </div>
    </div>
  );
}
