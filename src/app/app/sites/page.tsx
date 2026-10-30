"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type SiteRow } from "@/lib/data";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LivePill } from "@/components/v2/atoms";
import { AiVisibilityPanel } from "@/components/v2/sites/ai-visibility-panel";
import { AsyncState, EmptyState } from "@/components/app/async-state";
import { Panel, Regressions, useSites } from "@/components/app/workspace-feed";

/**
 * Sites: every site Olmene watches here (readiness, weekly re-scan, AI search
 * share) and how a site gets on the list. Work waiting for review and the
 * activity feed live on the Overview (/app/). `?site=<id>&tab=ai` opens a
 * site's AI search visibility (the ai_visibility_change email links here).
 */
export default function SitesPage() {
  const router = useRouter();
  const [params, setParams] = useState<{ site: string | null; tab: string | null }>({ site: null, tab: null });
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      setParams({ site: p.get("site"), tab: p.get("tab") });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // Client-side state mirrors the query string (no useSearchParams: keeps the page static).
  const go = (site: string | null, tab: string | null) => {
    router.push(site ? `/app/sites/?site=${encodeURIComponent(site)}${tab ? `&tab=${tab}` : ""}` : "/app/sites/");
    setParams({ site, tab });
  };
  const sites = useSites();
  const selected = params.site ? sites.data?.find((s) => s.id === params.site) : undefined;

  if (params.site && params.tab === "ai") {
    return (
      <div className="mx-auto grid max-w-5xl gap-6">
        <header className="grid gap-2">
          <button type="button" onClick={() => go(null, null)} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5 rtl-flip" aria-hidden /> All sites
          </button>
          <h1 className="o-display text-[32px] leading-tight">{selected?.host ?? "Your site"}</h1>
        </header>
        <AiVisibilityPanel siteId={params.site} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="o-display text-[28px] leading-tight">Sites</h1>
          <p className="max-w-xl text-[14px] text-muted-foreground">
            Every site with a completed full analysis is re-scanned weekly. Olmene tells you when a check gets worse.
          </p>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Sites" className="grid gap-3">
          <AsyncState
            query={sites}
            what="sites"
            skeleton={[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                title="No sites yet"
                body="A site appears here when its first full analysis completes. From then on Olmene re-scans it every week."
                action={
                  <Button asChild>
                    <Link href="/app/new/">
                      Run your first analysis <ArrowRight className="size-4 rtl-flip" aria-hidden />
                    </Link>
                  </Button>
                }
              />
            }
          >
            {(d) => d.map((s) => <SiteCard key={s.id} site={s} onAi={() => go(s.id, "ai")} />)}
          </AsyncState>
        </section>

        <aside className="grid gap-6">
          <Panel title="How a site gets watched">
            <div className="grid gap-3 px-2.5 py-2 text-[13.5px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Full analysis:</span> when it completes, its site is added here and re-scanned every week.
                It uses one analysis from your plan.
              </p>
              <p>
                <span className="font-medium text-foreground">Free scan:</span> checks the basics once. It doesn&apos;t add the site or use an analysis.
              </p>
              <p className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm">
                  <Link href="/app/new/">New analysis</Link>
                </Button>
                <Button asChild size="sm" variant="hairline">
                  <Link href="/app/scan/">Free scan</Link>
                </Button>
              </p>
            </div>
          </Panel>
          <Panel title="Regressions">
            <Regressions />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function SiteCard({ site, onAi }: { site: SiteRow; onAi: () => void }) {
  const score = site.last_score;
  const tone = score == null ? "" : score >= 75 ? "bg-tel-emerald" : score >= 50 ? "bg-tel-amber" : "bg-tel-rose";
  return (
    <article className="o-artifact grid gap-4 rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-medium">{site.host}</h2>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[12px] text-tel-sky hover:underline" dir="ltr">
            {site.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </div>
        <LivePill tone={site.monitor ? "live" : "neutral"} pulse={false}>
          {site.monitor ? "watched weekly" : "not watched"}
        </LivePill>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <dt className="text-[12px] text-muted-foreground">Readiness</dt>
          <dd className="grid gap-1.5">
            <span className="o-readout-strong text-[22px] leading-none">
              {score ?? "—"}
              {score != null && <span className="text-[13px] text-faint"> / 100</span>}
            </span>
            {score != null && (
              <span className="block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, score)}%` }} />
              </span>
            )}
          </dd>
        </div>
        <div className="grid gap-1.5">
          <dt className="text-[12px] text-muted-foreground">Last scan</dt>
          <dd className="text-[13.5px]">
            {site.last_scan_at ? fmtDateTime(site.last_scan_at) : "from the report"}
            {site.monitor && site.next_scan_at && <span className="block font-mono text-[11.5px] text-faint">next {fmtDate(site.next_scan_at)}</span>}
          </dd>
        </div>
        <div className="grid gap-1.5">
          <dt className="text-[12px] text-muted-foreground">AI search</dt>
          <dd className="text-[13.5px]">
            {site.ai_last ? (
              <>
                <span className="o-readout-strong text-[22px] leading-none">{Math.round(site.ai_last.mentionShare * 100)}%</span>
                <span className="block font-mono text-[11.5px] text-faint">of answers mention you</span>
              </>
            ) : (
              <span className="text-muted-foreground">not checked yet</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-edge pt-4">
        <Button size="sm" variant="hairline" onClick={onAi}>
          AI search visibility <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
        </Button>
      </div>
    </article>
  );
}
