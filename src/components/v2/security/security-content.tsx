"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Section, SectionHeader } from "@/components/v2/home/section";
import { useI18n, Tx, usePageMeta } from "@/i18n/provider";
import { FOUNDER_LINKEDIN, SUPPORT_EMAIL } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Security & trust — what the GitHub app can and cannot do, and how data is
 * handled. Every statement here mirrors the code: permissions from
 * api/agent/github/register (contents + pull_requests), GET/POST-only client
 * (lib/agent/allowlist), stored diffs (lib/agent/runner), retention (privacy
 * policy, free-audit prune cron). Change the code → change this page.
 */

const FLOW: Array<{ key: string; you?: boolean }> = [
  { key: "s1" },
  { key: "s2" },
  { key: "s3" },
  { key: "s4" },
  { key: "s5", you: true },
  { key: "s6", you: true },
  { key: "s7" },
];

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

function Prose({ title, k, id }: { title: string; k: string; id?: string }) {
  const { t } = useI18n();
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-7">
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
          <p className="mt-6 max-w-2xl border-s-2 border-primary ps-4 text-lg font-medium leading-relaxed sm:text-xl">
            {t("sec.control")}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">{t("sec.updated")}</p>
        </Section>

        {/* Workflow */}
        <Section id="workflow" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.flow.title")}</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {FLOW.map((s, i) => (
              <li
                key={s.key}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border p-4",
                  s.you ? "border-primary/50 bg-leaf-soft" : "bg-card",
                )}
              >
                <span className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5", s.you ? "bg-primary text-primary-foreground" : "border")}>
                    {t(s.you ? "sec.flow.you" : "sec.flow.olmene")}
                  </span>
                </span>
                <span className="font-semibold leading-snug">{t(`sec.flow.${s.key}`)}</span>
                <span className="text-sm leading-snug text-muted-foreground">{t(`sec.flow.${s.key}d`)}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* GitHub permissions */}
        <Section id="github" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.gh.title")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("sec.gh.lede")}</p>
          <div className="mt-6 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colPerm")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colAccess")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.gh.colWhy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PERMISSIONS.map((p) => (
                  <tr key={p} className="align-top">
                    <th scope="row" className="px-4 py-3 font-semibold">{t(`sec.gh.${p}`)}</th>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{t(`sec.gh.${p}a`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t(`sec.gh.${p}w`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{t("sec.gh.none")}</p>
        </Section>

        {/* Capabilities */}
        <Section id="capabilities" className="py-8 md:py-10">
          <h2 className="o-display text-2xl sm:text-3xl">{t("sec.cap.title")}</h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <li key={c.key} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
                <span
                  className={cn(
                    "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs",
                    c.yes ? "bg-primary/15 text-primary" : "bg-signal-rust/15 text-signal-rust",
                  )}
                >
                  {c.yes ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <X className="size-3.5" strokeWidth={2.5} aria-hidden />}
                  {t(c.yes ? "sec.cap.yes" : "sec.cap.no")}
                </span>
                <span className="grid gap-1">
                  <span className="font-semibold leading-snug">{t(`sec.cap.${c.key}`)}</span>
                  <span className="text-sm leading-snug text-muted-foreground">{t(`sec.cap.${c.key}n`)}</span>
                </span>
              </li>
            ))}
          </ul>
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
          <div className="mt-6 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colWhat")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colHow")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("sec.data.colKept")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
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
          <div className="mt-4 rounded-2xl border bg-card p-6 sm:p-7">
            <h3 className="o-display text-xl">{t("sec.data.subTitle")}</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t("sec.data.subP")}</p>
            <p className="mt-3 text-sm">
              <Link href="/legal/privacy/" className="underline underline-offset-4 hover:text-primary">
                {t("sec.data.more")}
              </Link>
            </p>
          </div>
        </Section>

        {/* Operator */}
        <Section id="operator" className="pt-8 md:pt-10">
          <div className="max-w-2xl rounded-2xl border bg-card p-6 sm:p-7">
            <h2 className="o-display text-xl">{t("sec.who.title")}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t("sec.who.p")}</p>
            <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("sec.who.linkedin")}
              </a>
            </p>
            {SUPPORT_EMAIL && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("sec.who.contact")}{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
                  {SUPPORT_EMAIL}
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
