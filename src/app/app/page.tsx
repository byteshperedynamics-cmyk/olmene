"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsyncState, EmptyState } from "@/components/app/async-state";
import {
  Activity,
  NeedsYou,
  Panel,
  RecentVerification,
  Regressions,
  REGRESSION_KINDS,
  ScoreCell,
  useAgentJobs,
  useNotifications,
  useSites,
} from "@/components/app/workspace-feed";
import { prStage } from "@/components/v2/agent/fixers";
import { getClients } from "@/lib/agency/client";
import { featureAgentEnabled, getAgentConfig, getSiteConnections } from "@/lib/agent-client";
import { updateProfile, useProfile } from "@/lib/account-client";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { activeWorkspace, useWorkspaces } from "@/lib/workspace/client";
import { atLeast } from "@/lib/workspace/roles";
import { cn } from "@/lib/utils";

/**
 * Overview (/app/): the workspace at a glance for daily agency work. What
 * needs a person (reviews, open pull requests, guided fixes), what got worse,
 * what was verified live, and every watched site with its score. The list of
 * full analyses moved to /app/analyses/ (Reports).
 */
export default function OverviewPage() {
  const { session } = useSession();
  const workspaces = useWorkspaces(session);
  const current = workspaces.current;
  const agency = current?.kind === "agency";
  const sites = useSites();
  const jobs = useAgentJobs();
  const notes = useNotifications();
  const agentOn = featureAgentEnabled();

  const awaiting = jobs.data?.jobs.filter((j) => j.status === "awaiting_approval").length;
  const regressions = notes.data?.filter((n) => REGRESSION_KINDS.includes(n.kind) && Date.now() - Date.parse(n.created_at) < 30 * 864e5).length;
  const verified = jobs.data?.jobs.filter((j) => prStage(j) === "verified").length;

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="o-display text-[28px] leading-tight">Overview</h1>
          <p className="text-[14px] text-muted-foreground">
            {current?.name ? `${current.name}: work waiting for you` : "Work waiting for you"}, what changed, and every watched site.
          </p>
        </div>
      </header>

      <SetupChecklist agency={agency} />

      <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border", agentOn && "md:grid-cols-4")}>
        <Stat label="Sites watched weekly" value={sites.data ? sites.data.filter((s) => s.monitor).length : undefined} failed={sites.isError && !sites.data} />
        {agentOn && <Stat label="Fix runs to review" value={awaiting} failed={jobs.isError && !jobs.data} attention={!!awaiting} />}
        <Stat label="Regressions, last 30 days" value={regressions} failed={notes.isError && !notes.data} attention={!!regressions} />
        {agentOn && <Stat label="Fixes verified live" value={verified} failed={jobs.isError && !jobs.data} />}
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          {agentOn && (
            <Panel title="Needs you" action={<SmallLink href="/app/agent/">Fix runs</SmallLink>}>
              <NeedsYou />
            </Panel>
          )}
          <Panel title="Sites" action={<SmallLink href="/app/sites/">All sites</SmallLink>}>
            <SitesTable />
          </Panel>
        </div>
        <div className="grid min-w-0 gap-6">
          <Panel title="Regressions">
            <Regressions />
          </Panel>
          {agentOn && (
            <Panel title="Verification after merge">
              <RecentVerification />
            </Panel>
          )}
          <Panel title="Activity">
            <Activity limit={8} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, failed, attention }: { label: string; value: number | undefined; failed?: boolean; attention?: boolean }) {
  return (
    <div className="flex flex-col justify-between gap-1.5 bg-card px-4 py-4 sm:px-5">
      <dd className={cn("o-readout-strong order-2 text-[24px] leading-none", attention ? "text-foreground" : "text-foreground/80")}>
        {value === undefined ? <span className="text-faint" title={failed ? "Couldn't load" : "Loading"}>–</span> : value}
      </dd>
      <dt className="order-1 text-[13px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="o-hit relative inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children} <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
    </Link>
  );
}

/** Every site Olmene watches here: host, score, last check, next check. */
function SitesTable() {
  const sites = useSites();
  return (
    <AsyncState
      query={sites}
      what="sites"
      isEmpty={(d) => d.length === 0}
      empty={
        <EmptyState
          title="No watched sites yet"
          body="A site is added and re-checked weekly once its first full analysis completes. A free scan checks the basics once and doesn't add the site."
          action={
            <>
              <Button asChild size="sm">
                <Link href="/app/new/">New analysis</Link>
              </Button>
              <Button asChild size="sm" variant="hairline">
                <Link href="/app/scan/">Free scan</Link>
              </Button>
            </>
          }
        />
      }
    >
      {(d) => (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-start text-[14px]">
            <thead>
              <tr className="text-[12px] text-muted-foreground">
                <th scope="col" className="px-2.5 py-2 text-start font-normal">
                  Site
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-normal">
                  Readiness
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-normal">
                  Last check
                </th>
                <th scope="col" className="px-2.5 py-2 text-start font-normal">
                  Next check
                </th>
              </tr>
            </thead>
            <tbody>
              {d.slice(0, 12).map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="max-w-[16rem] px-2.5 py-2.5">
                    <span className="block truncate font-medium" dir="ltr">
                      {s.host}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <ScoreCell site={s} />
                  </td>
                  <td className="px-2.5 py-2.5 text-muted-foreground">{s.last_scan_at ? fmtDate(s.last_scan_at) : "from the report"}</td>
                  <td className="px-2.5 py-2.5 text-muted-foreground">{s.monitor && s.next_scan_at ? fmtDate(s.next_scan_at) : "not watched"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.length > 12 && (
            <p className="px-2.5 pb-1 pt-3 text-[13px] text-muted-foreground">
              <Link href="/app/sites/" className="underline underline-offset-4">
                {d.length - 12} more on the Sites page
              </Link>
            </p>
          )}
        </div>
      )}
    </AsyncState>
  );
}

/**
 * First steps, inline instead of a blocking dialog. Each step is ticked from
 * real data, never by clicking it. Hidden for good with "Hide", or once every
 * step is done (both mark the account onboarded). Name and photo are
 * optional and live in Account settings.
 */
function SetupChecklist({ agency }: { agency: boolean }) {
  const qc = useQueryClient();
  const { session } = useSession();
  const profile = useProfile(session);
  const workspaces = useWorkspaces(session);
  const show = !!profile.data && !profile.data.onboarded_at;
  const canEdit = !workspaces.current || atLeast(workspaces.current.role, "member");
  const agentOn = featureAgentEnabled();
  const sites = useSites();
  const config = useQuery({ queryKey: ["agent-config"], queryFn: getAgentConfig, enabled: show && agentOn, retry: 1 });
  const siteConns = useQuery({ queryKey: ["site-connections"], queryFn: getSiteConnections, enabled: show && agentOn, retry: 1 });
  const clients = useQuery({ queryKey: ["clients", activeWorkspace() ?? "own"], queryFn: getClients, enabled: show && agency, retry: 1 });

  const steps: Array<{ key: string; done: boolean | undefined; title: string; body: string; href: string; cta: string }> = [
    {
      key: "site",
      done: sites.data ? sites.data.length > 0 : undefined,
      title: "Add a site",
      body: "Run a full analysis on a site you look after. When it completes, the site is watched and re-checked every week.",
      href: "/app/new/",
      cta: "New analysis",
    },
  ];
  if (agentOn)
    steps.push({
      key: "delivery",
      done:
        config.data || siteConns.data
          ? !!config.data?.github.connections.some((c) => c.status === "active") || (siteConns.data?.connections.length ?? 0) > 0
          : undefined,
      title: "Connect how fixes reach the site",
      body: "GitHub for pull requests, or Webflow or WordPress so Olmene applies the changes you approve. Other platforms get step-by-step guides.",
      href: "/app/agent/",
      cta: "Connect",
    });
  if (agency)
    steps.push({
      key: "client",
      done: clients.data ? clients.data.clients.some((c) => !!c.portal) : undefined,
      title: "Share a client page",
      body: "Group the site under a client and turn on their progress page: scores and checks, under your agency's name.",
      href: "/app/clients/",
      cta: "Clients",
    });

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const hide = async () => {
    await updateProfile({ onboarded: true }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["profile"] });
  };
  // Everything done: the checklist retires itself.
  useEffect(() => {
    if (show && canEdit && allDone) void hide();
    // Fires once per completion; hide only reads stable values.
  }, [show, canEdit, allDone]);

  if (!show || !canEdit || allDone) return null;

  return (
    <section aria-labelledby="setup-title" className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-3">
          <h2 id="setup-title" className="text-[14px] font-medium">
            Set up this workspace
          </h2>
          <span className="o-readout-strong text-[12px] text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void hide()}
          className="o-hit relative inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
          aria-label="Hide the setup checklist"
        >
          <X className="size-3.5" aria-hidden /> Hide
        </button>
      </header>
      <ol className="grid divide-y">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[12px]",
                s.done ? "border-tel-emerald/40 bg-tel-emerald/10 text-tel-emerald" : "border-rim text-muted-foreground",
              )}
              aria-hidden
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className={cn("text-[14px] font-medium", s.done && "text-muted-foreground line-through decoration-faint")}>
                {s.title}
                <span className="sr-only">{s.done ? " (done)" : s.done === undefined ? " (checking)" : " (to do)"}</span>
              </p>
              {!s.done && <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>}
            </div>
            {!s.done && (
              <Button asChild size="sm" variant="hairline">
                <Link href={s.href}>{s.cta}</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
      <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground sm:px-5">
        Your name and photo are optional; add them any time in{" "}
        <Link href="/app/account/#profile" className="underline underline-offset-4 hover:text-foreground">
          Account settings
        </Link>
        .
      </p>
    </section>
  );
}
