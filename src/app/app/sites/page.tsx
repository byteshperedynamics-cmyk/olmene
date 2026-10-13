"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listNotifications, listSites, type NotificationRow, type SiteRow } from "@/lib/data";
import { featureAgentEnabled, getAgentJobs, getGuidedRuns } from "@/lib/agent-client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Eyebrow, LivePill } from "@/components/v2/atoms";
import { AiVisibilityPanel } from "@/components/v2/sites/ai-visibility-panel";

/**
 * Overview: the sites Olmene watches (readiness, weekly re-scan, AI search
 * share), what still needs you (fix runs awaiting review, open pull requests,
 * guided fixes not live yet) and recent activity. `?site=<id>&tab=ai` opens a
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
  const sites = useQuery({ queryKey: ["sites"], queryFn: listSites });
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
        <div className="grid gap-2">
          <Eyebrow>Overview</Eyebrow>
          <h1 className="o-display text-[32px] leading-tight">Your sites</h1>
          <p className="max-w-xl text-[15px] text-muted-foreground">
            Every site with a completed report is re-scanned weekly. Olmene tells you when a check gets worse.
          </p>
        </div>
        <Button asChild variant="hairline">
          <Link href="/app/new/">New analysis</Link>
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Sites" className="grid gap-3">
          {sites.isLoading ? (
            [0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
          ) : !sites.data?.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <p className="font-medium">No sites yet</p>
              <p className="mx-auto mt-1 max-w-md text-[14px] text-muted-foreground">
                A site appears here when its first report completes. From then on Olmene re-scans it every week.
              </p>
              <Button asChild className="mt-5">
                <Link href="/app/new/">
                  Run your first analysis <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
            </div>
          ) : (
            sites.data.map((s) => <SiteCard key={s.id} site={s} onAi={() => go(s.id, "ai")} />)
          )}
        </section>

        <aside className="grid gap-6">
          {featureAgentEnabled() && <OpenWork />}
          <Activity />
        </aside>
      </div>
    </div>
  );
}

function SiteCard({ site, onAi }: { site: SiteRow; onAi: () => void }) {
  const score = site.last_score;
  const tone = score == null ? "" : score >= 75 ? "bg-tel-emerald" : score >= 50 ? "bg-tel-amber" : "bg-tel-rose";
  return (
    <article className="o-artifact grid gap-4 rounded-2xl p-5 sm:p-6">
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

/** Fix runs waiting for review, open pull requests, guided fixes not live yet. */
function OpenWork() {
  const jobs = useQuery({ queryKey: ["agent-jobs"], queryFn: getAgentJobs });
  const guided = useQuery({ queryKey: ["guided-runs"], queryFn: getGuidedRuns });
  const items: Array<{ key: string; href: string; label: string; meta: string; tone: "live" | "neutral" }> = [];
  for (const j of jobs.data?.jobs ?? []) {
    if (j.status === "awaiting_approval") items.push({ key: j.id, href: `/app/agent/job/${j.id}`, label: "Fix run waiting for your review", meta: j.input?.targetRepo ?? "", tone: "live" });
    else if (j.pr_state === "open" && j.pr_number) items.push({ key: j.id, href: `/app/agent/job/${j.id}`, label: `Pull request #${j.pr_number} is open`, meta: j.input?.targetRepo ?? "", tone: "neutral" });
  }
  for (const r of guided.data?.runs ?? []) {
    if (r.total_count > 0 && r.live_count < r.total_count)
      items.push({ key: r.id, href: `/app/agent/guided/${r.id}`, label: `${r.live_count} of ${r.total_count} guided fixes live`, meta: r.site_url.replace(/^https?:\/\//, ""), tone: "neutral" });
  }
  if (jobs.isLoading || guided.isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  return (
    <section className="rounded-2xl border bg-card">
      <h2 className="border-b px-5 py-3.5 text-[14px] font-medium">Needs you</h2>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-[13.5px] text-muted-foreground">Nothing waiting. Fix runs and guided fixes show up here when they need a step from you.</p>
      ) : (
        <ul className="divide-y divide-[var(--edge)]">
          {items.slice(0, 8).map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px]">{it.label}</span>
                  {it.meta && <span className="block truncate font-mono text-[11.5px] text-faint" dir="ltr">{it.meta}</span>}
                </span>
                {it.tone === "live" ? <span className="o-pulse-dot" aria-hidden /> : <ArrowRight className="size-3.5 shrink-0 text-faint rtl-flip" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Activity() {
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications(15) });
  return (
    <section className="rounded-2xl border bg-card">
      <h2 className="border-b px-5 py-3.5 text-[14px] font-medium">Activity</h2>
      {q.isLoading ? (
        <div className="grid gap-2 p-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : !q.data?.length ? (
        <p className="px-5 py-4 text-[13.5px] text-muted-foreground">Reports, pull requests, live checks and alerts appear here as they happen.</p>
      ) : (
        <ol className="divide-y divide-[var(--edge)]">
          {q.data.map((n) => {
            const a = describeActivity(n);
            const body = (
              <>
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", a.tone === "bad" ? "bg-tel-rose" : a.tone === "warn" ? "bg-tel-amber" : a.tone === "good" ? "bg-tel-emerald" : "bg-faint")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13.5px] leading-snug">{a.text}</span>
                  <span className="block font-mono text-[11px] text-faint">{fmtDateTime(n.created_at)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {a.href ? (
                  <Link href={a.href} className="flex gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function describeActivity(n: NotificationRow): { text: string; href?: string; tone: "good" | "bad" | "warn" | "plain" } {
  const p = n.payload as Record<string, unknown>;
  const site = String(p.site ?? "your site");
  const enc = (v: unknown) => encodeURIComponent(String(v ?? ""));
  switch (n.kind) {
    case "report_ready":
      return { text: `Report ready for ${site}${typeof p.score === "number" ? ` · ${p.score}/100` : ""}`, href: `/app/report/?id=${enc(p.jobId)}`, tone: "plain" };
    case "pr_opened":
      return { text: `Pull request #${p.prNumber} opened on ${p.repo}`, href: `/app/agent/job/${enc(p.jobId)}`, tone: "plain" };
    case "fixes_live":
      return { text: `${p.passed} of ${p.total} merged fixes live on ${site}`, href: `/app/agent/job/${enc(p.jobId)}`, tone: "good" };
    case "guided_live":
      return { text: `All ${p.total} guided changes live on ${site}`, href: `/app/agent/guided/${enc(p.runId)}`, tone: "good" };
    case "ai_visibility_change":
      return { text: `AI search answers changed for ${site}`, href: `/app/sites/?site=${enc(p.siteId)}&tab=ai`, tone: "warn" };
    case "fix_regression":
      return { text: `A merged fix stopped working on ${site}`, href: `/app/agent/job/${enc(p.jobId)}`, tone: "bad" };
    case "site_regression": {
      const k = Array.isArray(p.regressed) ? p.regressed.length : 0;
      return { text: `${k} ${k === 1 ? "check" : "checks"} got worse on ${site}`, tone: "bad" };
    }
    case "competitor_change":
      return { text: `${p.competitor} changed their homepage`, tone: "warn" };
    case "weekly_digest":
      return { text: "Weekly summary", tone: "plain" };
    default:
      return { text: n.kind.replace(/_/g, " "), tone: "plain" };
  }
}
