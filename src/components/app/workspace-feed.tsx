"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { listNotifications, listRegressions, listSites, type NotificationRow, type SiteRow } from "@/lib/data";
import { featureAgentEnabled, getAgentJobs, getGuidedRuns, type AgentJob } from "@/lib/agent-client";
import { PR_STAGE_COPY, prStage } from "@/components/v2/agent/fixers";
import { LivePill } from "@/components/v2/atoms";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsyncState, EmptyState, type QueryLike } from "./async-state";

/** Shared queries: the overview refreshes these caches from one timer. */
export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: listSites });
export const useNotifications = () => useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications(30) });
export const useRegressions = () => useQuery({ queryKey: ["regressions"], queryFn: listRegressions });
export const useAgentJobs = () => useQuery({ queryKey: ["agent-jobs"], queryFn: getAgentJobs, enabled: featureAgentEnabled() });
export const useGuidedRuns = () => useQuery({ queryKey: ["guided-runs"], queryFn: getGuidedRuns, enabled: featureAgentEnabled() });

/** A titled panel with the same frame everywhere on the overview. */
export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card", className)} aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <h2 className="text-[14px] font-medium">{title}</h2>
        {action}
      </header>
      <div className="p-2 sm:p-3">{children}</div>
    </section>
  );
}

type WorkItem = { key: string; href: string; label: string; meta: string; tone: "live" | "neutral"; at: string };

/** Fix runs waiting for review, open pull requests, guided fixes not live yet. */
export function NeedsYou({ limit = 8 }: { limit?: number }) {
  const jobs = useAgentJobs();
  const guided = useGuidedRuns();
  // Both lists feed one queue: it is ready only when both answered.
  const merged: QueryLike<WorkSource> = {
    data: jobs.data && guided.data ? { jobs: jobs.data.jobs, runs: guided.data.runs } : undefined,
    error: jobs.error ?? guided.error,
    isError: jobs.isError || guided.isError,
    isPending: jobs.isPending || guided.isPending,
    isFetching: jobs.isFetching || guided.isFetching,
    dataUpdatedAt: Math.min(jobs.dataUpdatedAt || Date.now(), guided.dataUpdatedAt || Date.now()),
    refetch: () => Promise.all([jobs.refetch(), guided.refetch()]),
  };
  return (
    <AsyncState
      query={merged}
      what="work waiting for you"
      compact
      isEmpty={(d) => workItems(d).length === 0}
      empty={<EmptyState compact title="Nothing waiting" body="Fix runs that need your review, open pull requests and guided fixes not live yet show up here." />}
    >
      {(d) => (
        <ul className="grid gap-0.5">
          {workItems(d)
            .slice(0, limit)
            .map((it) => (
              <li key={it.key}>
                <Link href={it.href} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px]">{it.label}</span>
                    {it.meta && (
                      <span className="block truncate font-mono text-[12px] text-faint" dir="ltr">
                        {it.meta}
                      </span>
                    )}
                  </span>
                  {it.tone === "live" ? (
                    <LivePill tone="live" className="shrink-0">
                      review
                    </LivePill>
                  ) : (
                    <ArrowRight className="size-3.5 shrink-0 text-faint rtl-flip" aria-hidden />
                  )}
                </Link>
              </li>
            ))}
        </ul>
      )}
    </AsyncState>
  );
}

interface WorkSource {
  jobs: AgentJob[];
  runs: Array<{ id: string; total_count: number; live_count: number; site_url: string; created_at: string }>;
}

function workItems(d: WorkSource): WorkItem[] {
  const items: WorkItem[] = [];
  for (const j of d.jobs) {
    const repo = j.input?.targetRepo ?? "";
    if (j.status === "awaiting_approval") items.push({ key: j.id, href: `/app/agent/job/${j.id}`, label: "Fix run waiting for your review", meta: repo, tone: "live", at: j.created_at });
    else if (prStage(j) === "opened") items.push({ key: j.id, href: `/app/agent/job/${j.id}`, label: `Pull request #${j.pr_number} is open: merge it on GitHub`, meta: repo, tone: "neutral", at: j.created_at });
  }
  for (const r of d.runs) {
    if (r.total_count > 0 && r.live_count < r.total_count)
      items.push({
        key: r.id,
        href: `/app/agent/guided/${r.id}`,
        label: `${r.live_count} of ${r.total_count} guided fixes live`,
        meta: r.site_url.replace(/^https?:\/\//, ""),
        tone: "neutral",
        at: r.created_at,
      });
  }
  // Reviews first: they block everything after them.
  return items.sort((a, b) => (a.tone === b.tone ? (b.at > a.at ? 1 : -1) : a.tone === "live" ? -1 : 1));
}

/** Checks that got worse and merged fixes that stopped working, last 30 days. */
export function Regressions() {
  const q = useRegressions();
  return (
    <AsyncState
      query={q}
      what="regressions"
      compact
      isEmpty={(d) => d.count === 0}
      empty={<EmptyState compact title="No regressions in the last 30 days" body="Olmene re-checks every watched site weekly and lists any check that gets worse here." />}
    >
      {(d) => <FeedList rows={d.items} />}
    </AsyncState>
  );
}

/** Merged fixes and where their live check stands. */
export function RecentVerification() {
  const jobs = useAgentJobs();
  return (
    <AsyncState
      query={jobs}
      what="fix verification"
      compact
      isEmpty={(d) => d.jobs.every((j) => !prStage(j) || prStage(j) === "opened")}
      empty={
        <EmptyState compact title="Nothing merged yet" body="After a pull request is merged, Olmene checks the live site and shows here whether each fix is live." />
      }
    >
      {(d) => (
        <ul className="grid gap-0.5">
          {d.jobs
            .filter((j) => {
              const s = prStage(j);
              return s && s !== "opened";
            })
            .slice(0, 6)
            .map((j) => {
              const stage = prStage(j)!;
              const copy = PR_STAGE_COPY[stage];
              return (
                <li key={j.id}>
                  <Link href={`/app/agent/job/${j.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">Pull request #{j.pr_number}</span>
                      <span className="block truncate font-mono text-[12px] text-faint" dir="ltr">
                        {j.input?.targetRepo ?? ""}
                      </span>
                    </span>
                    <LivePill tone={copy.tone} pulse={false} className="shrink-0">
                      {copy.label}
                    </LivePill>
                  </Link>
                </li>
              );
            })}
        </ul>
      )}
    </AsyncState>
  );
}

/** Everything Olmene did or noticed, newest first. */
export function Activity({ limit = 10 }: { limit?: number }) {
  const q = useNotifications();
  return (
    <AsyncState
      query={q}
      what="activity"
      compact
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState compact title="No activity yet" body="Reports, pull requests, live checks and alerts appear here as they happen." />}
    >
      {(d) => <FeedList rows={d.slice(0, limit)} />}
    </AsyncState>
  );
}

function FeedList({ rows }: { rows: NotificationRow[] }) {
  return (
    <ol className="grid gap-0.5">
      {rows.map((n) => {
        const a = describeActivity(n);
        const body = (
          <>
            <span
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                a.tone === "bad" ? "bg-tel-rose" : a.tone === "warn" ? "bg-tel-amber" : a.tone === "good" ? "bg-tel-emerald" : "bg-faint",
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-[14px] leading-snug">{a.text}</span>
              <span className="block font-mono text-[12px] text-faint">{fmtDateTime(n.created_at)}</span>
            </span>
          </>
        );
        return (
          <li key={n.id}>
            {a.href ? (
              <Link href={a.href} className="flex gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3 px-2.5 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function describeActivity(n: NotificationRow): { text: string; href?: string; tone: "good" | "bad" | "warn" | "plain" } {
  const p = n.payload as Record<string, unknown>;
  const site = String(p.site ?? "your site");
  const enc = (v: unknown) => encodeURIComponent(String(v ?? ""));
  switch (n.kind) {
    case "report_ready":
      return { text: `Report ready for ${site}${typeof p.score === "number" ? `: ${p.score}/100` : ""}`, href: `/app/report/?id=${enc(p.jobId)}`, tone: "plain" };
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
      return { text: `${k} ${k === 1 ? "check" : "checks"} got worse on ${site}`, href: "/app/sites/", tone: "bad" };
    }
    case "competitor_change":
      return { text: `${p.competitor} changed their homepage`, tone: "warn" };
    case "weekly_digest":
      return { text: "Weekly summary", tone: "plain" };
    case "client_report": {
      const what = p.test ? `Test of ${p.client ?? "a client"}'s report` : `${p.client ?? "A client"}'s report`;
      const to = String(p.to ?? (p.test ? "you" : "a recipient"));
      const how = n.status === "sent" ? "sent to" : n.status === "pending" ? "on its way to" : n.status === "failed" ? "couldn't be sent to" : "not sent to";
      return { text: `${what} ${how} ${to}`, href: "/app/clients/", tone: n.status === "failed" ? "bad" : "plain" };
    }
    case "workspace_invite":
      return { text: `${p.inviter ?? "Someone"} invited ${p.to ?? "a teammate"} to the team`, href: "/app/team/", tone: "plain" };
    default:
      return { text: n.kind.replace(/_/g, " "), tone: "plain" };
  }
}

/** Score with its band colour and a word, never colour alone. */
export function ScoreCell({ site }: { site: Pick<SiteRow, "last_score"> }) {
  const s = site.last_score;
  if (s == null) return <span className="text-[13px] text-muted-foreground">not scored yet</span>;
  const tone = s >= 75 ? "text-tel-emerald" : s >= 50 ? "text-tel-amber" : "text-tel-rose";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={cn("o-readout-strong text-[15px]", tone)}>{s}</span>
      <span className="text-[12px] text-faint">/100</span>
    </span>
  );
}
