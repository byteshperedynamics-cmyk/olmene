"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Eyebrow, LivePill } from "@/components/v2/atoms";
import { CountUp } from "@/components/v2/count-up";
import { FixFeed, MergeRing, MetricBars } from "@/components/v2/data-viz";
import { Flower } from "@/components/v2/flower";
import { InView } from "@/components/v2/in-view";
import { usePublicStats, type PublicStats } from "@/lib/public-stats";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

const eur = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Open metrics (brief §5F). Public numbers that give build-in-public posts a
 * source. English only for now. Revenue appears only when the owner turns it
 * on (PUBLIC_METRICS_SHOW_MRR). CSS motion only (marketing page rule).
 */
export function OpenMetrics() {
  const { data, isLoading } = usePublicStats();
  return <OpenMetricsView data={data ?? null} isLoading={isLoading} />;
}

export function OpenMetricsView({ data, isLoading }: { data: PublicStats | null; isLoading: boolean }) {
  // Relative times and the local timestamp depend on the viewer's clock and
  // time zone: render them after mount so server and client markup match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const mergeRate = data && data.prsOpened >= 5 ? Math.round((data.prsMerged / data.prsOpened) * 100) : null;
  const weeks = data?.mrr?.weeks ?? [];
  const wow =
    weeks.length >= 2 && weeks[weeks.length - 2].mrr > 0
      ? Math.round(((weeks[weeks.length - 1].mrr - weeks[weeks.length - 2].mrr) / weeks[weeks.length - 2].mrr) * 100)
      : null;
  const maxMrr = Math.max(1, ...weeks.map((w) => w.mrr));
  const topTick = Math.ceil(maxMrr / 1000) * 1000;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div aria-hidden className="o-grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(80%_80%_at_50%_0%,black,transparent)]" />
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:px-6 md:py-20">
            <Eyebrow>Open metrics</Eyebrow>
            <h1 className="o-display text-[40px] leading-[1.03] sm:text-[56px]">Olmene, in the open.</h1>
            <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
              The real numbers behind the product, straight from the production database. Nothing here is rounded up or hand-edited.
            </p>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            {isLoading ? (
              <div className="grid place-items-center py-20">
                <Flower size={40} variant="breathe" />
              </div>
            ) : !data ? (
              <div className="mx-auto grid max-w-md justify-items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-card/60 px-6 py-12 text-center">
                <Flower size={32} variant="breathe" />
                <h2 className="o-display text-2xl">The live numbers are offline for a moment</h2>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  This page reads straight from the production database and shows nothing it can&apos;t verify. Check back in a few
                  minutes.
                </p>
                <Link href="/" className="mt-1 text-[14px] font-medium text-primary underline underline-offset-4 hover:text-primary/80">
                  Run a free scan meanwhile
                </Link>
              </div>
            ) : (
              <InView className="grid gap-4">
                <div className={`grid gap-4 ${data.mrr ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
                  {data.mrr && (
                    <div className="grid gap-5 rounded-2xl border bg-card p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Eyebrow>Monthly recurring revenue</Eyebrow>
                          <p className="mt-2 font-display text-[52px] leading-none">
                            <CountUp value={Math.round(data.mrr.current)} prefix="€" />
                          </p>
                        </div>
                        {wow !== null && (
                          <LivePill tone={wow >= 0 ? "live" : "neutral"}>
                            {wow >= 0 ? "+" : ""}
                            {wow}% this week
                          </LivePill>
                        )}
                      </div>
                      {weeks.length >= 2 ? (
                        <MetricBars
                          values={weeks.map((w) => w.mrr)}
                          max={topTick}
                          yLabels={[eur(topTick), eur(topTick / 2), "€0"]}
                          xLabels={[weeks[0].week.slice(5), weeks[weeks.length - 1].week.slice(5)]}
                          title={`Weekly MRR for the last ${weeks.length} weeks, from ${eur(weeks[0].mrr)} to ${eur(weeks[weeks.length - 1].mrr)}`}
                          format={(v) => eur(v)}
                        />
                      ) : (
                        <p className="text-[13px] text-muted-foreground">The weekly chart starts after the second weekly snapshot.</p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4">
                    <div className="flex items-center gap-4 rounded-2xl border bg-card p-6">
                      {mergeRate !== null ? (
                        <>
                          <MergeRing pct={mergeRate} />
                          <div>
                            <p className="font-display text-3xl">{mergeRate}%</p>
                            <p className="text-[13px] text-muted-foreground">of opened pull requests merged by founders</p>
                          </div>
                        </>
                      ) : (
                        <p className="text-[14px] text-muted-foreground">The merge rate appears once five pull requests have been opened.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { v: data.freeScans, l: "free scans run" },
                        { v: data.prsMerged, l: "fixes merged" },
                        { v: data.sitesMonitored, l: "sites connected" },
                        { v: data.measuredOutcomes, l: "measured outcomes" },
                      ].map((s) => (
                        <div key={s.l} className="rounded-2xl border bg-card px-4 py-4">
                          <p className="font-display text-3xl leading-none">
                            <CountUp value={s.v} />
                          </p>
                          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{s.l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="o-display text-xl">Recently merged fixes</h2>
                    <span className="font-mono text-[11px] text-faint">sites shown only with permission</span>
                  </div>
                  {data.feed.length ? (
                    <FixFeed
                      mergedLabel="merged"
                      items={data.feed.map((f, i) => ({
                        id: f.mergedAt + i,
                        title: f.fixes.length ? f.fixes.join(", ") : "Fix",
                        site: f.site ?? "a site",
                        ago: mounted ? ago(f.mergedAt) : "",
                      }))}
                    />
                  ) : (
                    <p className="text-[14px] text-muted-foreground">The first merged fixes will appear here.</p>
                  )}
                </div>

                <p className="text-center font-mono text-[11px] text-faint">
                  {mounted && <>Updated {new Date(data.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. </>}A fix counts as
                  merged when its pull request is merged on GitHub.
                </p>
              </InView>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
