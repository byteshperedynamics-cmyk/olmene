"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, GitPullRequest, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FreeAuditInput, FreeAuditResult } from "@/components/free-audit-form";
import { BrandBar } from "@/components/agency/client-portal";
import { ClientProgress } from "@/components/agency/client-progress";
import { StudioMark } from "@/components/studio-mark";
import { CHECK_COUNT, FOUNDER_LINKEDIN, FOUNDER_NAME, STUDIO_NAME } from "@/lib/config";
import { TRIAL_DAYS } from "@/lib/trial/rules";
import { EXAMPLE_CLIENT, EXAMPLE_FIX_DIFF, EXAMPLE_PROGRESS } from "@/lib/v2/sample-data";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ExampleBadge } from "../atoms";
import { DiffView } from "../diff-view";
import { FilmButton } from "./film";
import { PLATFORM_MARKS } from "./platform-marks";
import { Section, SectionHeader } from "./section";

/* ── 1. Compact split hero ────────────────────────────────────────────── */

/**
 * Hero (refinement 2026-10-30): what Olmene does for an agency in one line,
 * how it does it in two sentences, the assisted trial as the main way in,
 * and the free scan as a quieter second entry. Beside it, an inspectable
 * example of the product: a client site, its findings, one proposed change
 * with its evidence. Nothing moves until someone clicks.
 */
export function SplitHero() {
  const { t } = useI18n();
  return (
    <>
      <section className="relative isolate border-b border-edge">
        <div aria-hidden className="o-hero-backdrop pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pt-20">
          <div className="grid min-w-0 content-start gap-6">
            <h1 className="o-display o-hero-title text-[38px] leading-[1.05] sm:text-[52px] lg:text-[60px]">{t("home.hero.title")}</h1>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground">{t("home.hero.body")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="xl">
                <Link href="/business/#trial">
                  {t("cta.agencyTrial")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="xl" variant="hairline">
                <Link href="#pricing">{t("common.seePricing")}</Link>
              </Button>
            </div>
            <p className="text-[14px] text-muted-foreground">{t("home.hero.trialNote", { days: TRIAL_DAYS })}</p>

            <div id="free-diagnosis" className="mt-2 grid scroll-mt-24 gap-2 border-t border-edge pt-6">
              <p className="text-[14px] font-medium">{t("home.hero.scanLabel")}</p>
              <FreeAuditInput variant="hero" />
            </div>
            <FilmButton className="w-fit" />
          </div>

          <ClientSiteExample />
        </div>
      </section>
      <div className="mx-auto w-full max-w-4xl px-4 empty:hidden sm:px-6 [&:has(#diagnosis)]:py-12">
        <FreeAuditResult />
      </div>
    </>
  );
}

/** The hero's example: a client site with three findings; one opens to its evidence and change. */
function ClientSiteExample() {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const findings = [
    { title: "home.ex.f1", sev: "high", state: "ready" },
    { title: "home.ex.f2", sev: "high", state: "ready" },
    { title: "home.ex.f3", sev: "medium", state: "live" },
  ] as const;

  return (
    <figure className="min-w-0" aria-labelledby="hero-example-caption">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{EXAMPLE_CLIENT.client}</p>
            <p className="truncate font-mono text-[12px] text-muted-foreground" dir="ltr">
              {EXAMPLE_CLIENT.host}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[13px] text-muted-foreground">
              {t("cp.score")} <span className="o-readout-strong text-[15px] text-foreground">64</span>
              <span className="text-faint">/100</span>
            </p>
            <ExampleBadge label={t("common.example")} />
          </div>
        </div>

        <ul className="divide-y">
          {findings.map((f, i) => {
            const isOpen = open === i;
            return (
              <li key={f.title}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(isOpen ? -1 : i);
                    setReviewed(false);
                  }}
                  aria-expanded={isOpen}
                  aria-controls={`ex-finding-${i}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-[var(--dur-hover)] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-state)]", !isOpen && "-rotate-90 rtl:rotate-90")} aria-hidden />
                  <span className="min-w-0 flex-1 text-[14px]">{t(f.title)}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 text-[12px]",
                      f.sev === "high" ? "border-tel-rose/35 text-tel-rose" : "border-tel-amber/40 text-tel-amber",
                    )}
                  >
                    {t(f.sev === "high" ? "sev.high" : "sev.medium")}
                  </span>
                  <span className={cn("hidden shrink-0 text-[12.5px] sm:inline", f.state === "live" ? "text-tel-emerald" : "text-muted-foreground")}>
                    {t(f.state === "live" ? "home.ex.stateLive" : "home.ex.stateReady")}
                  </span>
                </button>
                {isOpen && (
                  <div id={`ex-finding-${i}`} className="grid gap-3 border-t bg-background/40 px-4 pb-4 pt-3">
                    {i === 0 ? (
                      <>
                        <dl className="grid gap-2.5 text-[13.5px] leading-relaxed">
                          <div>
                            <dt className="text-[12.5px] font-medium text-foreground">{t("home.ex.observation")}</dt>
                            <dd className="text-muted-foreground">{t("home.ex.f1.obs")}</dd>
                          </div>
                          <div>
                            <dt className="text-[12.5px] font-medium text-foreground">{t("rv.evidence").replace(/[:：]\s*$/, "")}</dt>
                            <dd className="font-mono text-[12px] text-muted-foreground" dir="ltr">
                              GET https://harborpine.example/ → 200 · &lt;head&gt;: no &lt;meta name=&quot;description&quot;&gt;
                            </dd>
                          </div>
                        </dl>
                        <DiffView files={EXAMPLE_FIX_DIFF} newFileLabel={t("diff.newFile")} animate={false} />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                            <GitPullRequest className="size-3.5" aria-hidden /> {t("home.ex.delivery")}
                          </p>
                          {reviewed ? (
                            <p role="status" className="text-[12.5px] text-muted-foreground">
                              {t("home.ex.reviewed")}
                            </p>
                          ) : (
                            <Button size="sm" variant="hairline" onClick={() => setReviewed(true)}>
                              {t("home.ex.review")}
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-[13.5px] leading-relaxed text-muted-foreground">{t(i === 1 ? "home.ex.f2.obs" : "home.ex.f3.obs")}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption id="hero-example-caption" className="mt-2.5 text-[13px] text-muted-foreground">
        {t("home.ex.caption")}
      </figcaption>
    </figure>
  );
}

/* ── 2. Supported workflows ───────────────────────────────────────────── */

const ROUTES = [
  { key: "pr", marks: ["Next.js", "Astro", "Nuxt", "SvelteKit"] },
  { key: "api", marks: ["Webflow", "WordPress"] },
  { key: "guided", marks: ["Shopify", "Wix", "Squarespace", "Framer"] },
] as const;
const ROWS = ["built", "arrives", "approves", "access"] as const;

/** Three ways a fix reaches a site, compared on the same rows. A table on wide screens, cards on phones. */
export function WorkflowMatrix() {
  const { t } = useI18n();
  const mark = (name: string) => PLATFORM_MARKS.find((m) => m.name === name);
  return (
    <Section id="how-it-works">
      <SectionHeader eyebrow={t("common.howItWorks")} title={t("home.flow.title")} lede={t("home.flow.lede")} />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ROUTES.map((r) => (
          <article key={r.key} className="grid content-start gap-4 rounded-xl border bg-card p-5">
            <div className="grid gap-2">
              <h3 className="text-[17px] font-medium">{t(`home.flow.${r.key}.name`)}</h3>
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-muted-foreground" aria-label={t("home.flow.row.built")}>
                {r.marks.map((n) => {
                  const m = mark(n);
                  return (
                    <li key={n} className="inline-flex items-center gap-1.5 text-[13px]">
                      {m && (
                        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden focusable="false">
                          <path d={m.d} fill="currentColor" />
                        </svg>
                      )}
                      <span translate="no">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <dl className="grid gap-3 border-t pt-4 text-[14px] leading-relaxed">
              {ROWS.filter((row) => row !== "built").map((row) => (
                <div key={row} className="grid gap-0.5">
                  <dt className="text-[12.5px] text-muted-foreground">{t(`home.flow.row.${row}`)}</dt>
                  <dd>{t(`home.flow.${r.key}.${row}`)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <p className="mt-5 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{t("home.flow.after")}</p>
    </Section>
  );
}

/* ── 5. What clients see ──────────────────────────────────────────────── */

/** The deliverable an agency sends: its client's progress page, as the client sees it. */
export function ClientDeliverable() {
  const { t } = useI18n();
  return (
    <Section id="clients" className="border-y border-edge">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-6">
          <SectionHeader eyebrow={t("home.deliver.label")} title={t("home.deliver.title")} lede={t("home.deliver.lede")} />
          <ul className="grid gap-3 text-[15px]">
            {["biz.a1", "biz.a2", "biz.a3"].map((k) => (
              <li key={k} className="grid gap-0.5">
                <span className="font-medium">{t(`${k}.t`)}</span>
                <span className="text-[14px] leading-relaxed text-muted-foreground">{t(`${k}.b`)}</span>
              </li>
            ))}
          </ul>
          <Link href="/business/" className="o-hit relative w-fit text-[14px] font-medium underline underline-offset-4 hover:text-foreground/80">
            {t("home.deliver.more")}
          </Link>
        </div>
        <ClientPagePreview />
      </div>
    </Section>
  );
}

/** A client page in miniature: the agency's bar, the client, one site's record. Example data. */
export function ClientPagePreview({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
          <span className="truncate font-mono text-[12px] text-faint" dir="ltr">
            olmene.com/c/…
          </span>
          <ExampleBadge label={t("common.example")} />
        </div>
        <BrandBar brand={{ name: EXAMPLE_CLIENT.agency, color: EXAMPLE_CLIENT.agencyColor, url: null, logoUrl: null, whiteLabel: false }} compact />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-1">
            <p className="o-eyebrow text-[13px]">{t("portal.preparedBy", { agency: EXAMPLE_CLIENT.agency })}</p>
            <p className="o-display text-[22px] leading-tight">{t("portal.title", { client: EXAMPLE_CLIENT.client })}</p>
          </div>
          <ClientProgress site={EXAMPLE_PROGRESS} compact />
        </div>
      </div>
      <figcaption className="mt-2.5 text-[13px] text-muted-foreground">{t("home.deliver.caption")}</figcaption>
    </figure>
  );
}

/* ── 6. Operator: who runs Olmene, what it can and can't do ─────────── */

/** The named operator, the permission boundary, and the counters (activity, not outcomes). */
export function Operator({ scans, sources }: { scans: number; sources: number }) {
  const { t } = useI18n();
  return (
    <Section id="about" className="border-t border-edge">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <p className="o-eyebrow">{t("about.eyebrow")}</p>
          <h2 className="o-display text-[28px] leading-tight sm:text-[32px]">{t("about.title")}</h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{t("about.p1")}</p>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{t("about.p2")}</p>
          <div className="grid gap-1.5 text-[14px]">
            <p translate="no" className="inline-flex items-center gap-2.5 font-medium text-foreground">
              <StudioMark size={24} />
              {STUDIO_NAME}
            </p>
            <p className="text-muted-foreground">
              {t("about.founder")}: <span className="font-medium text-foreground">{FOUNDER_NAME}</span>{" "}
              <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer" className="o-hit relative font-medium text-foreground underline underline-offset-4">
                LinkedIn
              </a>
            </p>
          </div>
          <p className="text-[13px] text-faint">{t("home.counters", { scans, sources })}</p>
        </div>

        <div className="grid content-start gap-4">
          <h3 className="text-[17px] font-medium">{t("cc.title")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <ul className="grid content-start gap-2.5 text-[14px]">
              {["cc.can4", "cc.can1", "cc.can2", "cc.can3"].map((k) => (
                <li key={k} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-tel-emerald" strokeWidth={2.5} aria-hidden />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <ul className="grid content-start gap-2.5 text-[14px] text-muted-foreground">
              {["cc.cannot1", "cc.cannot2", "cc.cannot3", "cc.cannot4"].map((k) => (
                <li key={k} className="flex items-start gap-2.5">
                  <X className="mt-0.5 size-4 shrink-0 text-tel-rose" strokeWidth={2.5} aria-hidden />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
            <Link href="/security/#github" className="o-hit relative font-medium underline underline-offset-4 hover:text-foreground/80">
              {t("home.links.permissions")}
            </Link>
            <Link href="/security/#data" className="o-hit relative font-medium underline underline-offset-4 hover:text-foreground/80">
              {t("home.links.data")}
            </Link>
          </p>
          <p className="text-[13px] text-muted-foreground">{t("home.checksNote", { n: CHECK_COUNT })}</p>
        </div>
      </div>
    </Section>
  );
}
