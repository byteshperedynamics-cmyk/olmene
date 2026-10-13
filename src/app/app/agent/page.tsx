"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AgentApiError, featureAgentEnabled, type AgentJob } from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flower } from "@/components/v2/flower";
import { Eyebrow, LivePill } from "@/components/v2/atoms";
import { useQuery } from "@tanstack/react-query";
import { getEntitlement } from "@/lib/data";
import { ConnectPanel } from "@/components/v2/agent/connect-panel";
import { StateMessage } from "@/components/v2/agent/job-view";
import { PrChecksPanel } from "@/components/v2/agent/pr-checks-panel";
import { useAgentHub, type DisconnectResult } from "@/components/v2/agent/use-agent-hub";
import { statusLine } from "@/components/v2/agent/fixers";

/** Fix runs hub (brief §5B): connection, new run, run history. */
export default function AgentPage() {
  const hub = useAgentHub();
  const { data: billing } = useQuery({ queryKey: ["entitlement"], queryFn: getEntitlement });
  const { config, jobs, activeConnection, completedReports, busy } = hub;
  // Arriving from a free scan ("Preview the fix"): the run is planned from the
  // saved scan, no completed report needed. Sign-in and the GitHub connect
  // round-trip both come back without the query string, so the scan id is
  // stashed and restored exactly once.
  const [scanId] = useState(() => {
    if (typeof window === "undefined") return null;
    const fromUrl = new URLSearchParams(window.location.search).get("scan");
    if (fromUrl) {
      sessionStorage.setItem("olmene.scanId", fromUrl);
      return fromUrl;
    }
    const saved = sessionStorage.getItem("olmene.scanId");
    if (saved) sessionStorage.removeItem("olmene.scanId");
    return saved;
  });

  if (!featureAgentEnabled()) {
    return (
      <StateMessage
        title="The fix agent isn't switched on yet"
        body="Fix runs are not enabled on this deployment. Your reports and free scans work as usual."
        action={
          <Button asChild variant="hairline">
            <Link href="/app/">Back to analyses</Link>
          </Button>
        }
      />
    );
  }

  if (config.error) {
    const msg =
      config.error instanceof AgentApiError && config.error.code === "agent_disabled"
        ? "Fix runs are switched off on the server for this deployment."
        : "Could not load the agent status. Check your connection and try again.";
    return (
      <StateMessage
        title="Fix runs are unavailable"
        body={msg}
        action={
          <Button variant="hairline" onClick={() => config.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (config.isLoading || !config.data) {
    return (
      <div className="grid place-items-center py-28">
        <Flower size={44} variant="breathe" />
      </div>
    );
  }

  const cfg = config.data;
  const ent = cfg.entitlement;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Eyebrow>Fix agent</Eyebrow>
          <h1 className="o-display text-[32px] leading-tight">Fix runs</h1>
          <p className="max-w-xl text-[15px] text-muted-foreground">
            Olmene turns your report into pull requests you review. Nothing is written until you approve.
          </p>
        </div>
        {ent.allowed ? (
          <LivePill tone="live" pulse={false} className="max-w-full whitespace-normal leading-snug">
            {ent.planName} · {ent.remaining} of {ent.limit} fixes left this month
          </LivePill>
        ) : (
          <LivePill tone="neutral" className="max-w-full whitespace-normal leading-snug">
            Planning and previews are free · shipping fixes needs a plan
          </LivePill>
        )}
      </header>

      {cfg.killSwitch && (
        <div className="flex items-start gap-3 rounded-2xl border border-signal-amber/40 bg-card p-5 text-[14px]">
          <ShieldX className="mt-0.5 size-4 shrink-0 text-signal-amber" aria-hidden />
          <div>
            <p className="font-medium">Fix runs are paused for maintenance</p>
            <p className="text-muted-foreground">Pull requests already opened are not affected. Check back shortly.</p>
          </div>
        </div>
      )}

      {!activeConnection ? (
        <ConnectPanel
          hasScan={completedReports.length > 0}
          canAnalyze={!billing || billing.active || billing.reportCredits > 0}
          githubConfigured={cfg.github.configured}
          canRegister={cfg.github.canRegister ?? false}
          githubConnected={false}
          killSwitch={cfg.killSwitch}
          busy={busy}
          onRegister={hub.onRegister}
          onConnect={hub.onConnect}
          installUrl={hub.installUrl}
        />
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-tel-emerald/10">
                <ShieldCheck className="size-4 text-tel-emerald" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">
                  Connected as <span className="font-mono">{activeConnection.account}</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {activeConnection.repos?.length ?? 0} {activeConnection.repos?.length === 1 ? "repository" : "repositories"} ·
                  verified {activeConnection.lastVerifiedAt ? fmtDateTime(activeConnection.lastVerifiedAt) : "at connect"}
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="hairline" disabled={busy !== null}>
                  {busy === "disconnect" ? "Disconnecting…" : "Disconnect and verify"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Olmene deletes this connection and checks with GitHub that it can no longer reach your
                    repositories. Open pull requests stay on GitHub. You can connect again any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep connected</AlertDialogCancel>
                  <AlertDialogAction onClick={hub.onDisconnect}>Disconnect</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          <section className="grid gap-4 rounded-2xl border bg-card p-6">
            <div>
              <h2 className="o-display text-2xl">{scanId ? "Preview fixes from your free scan" : "Start a fix run"}</h2>
              <p className="mt-1 text-[14px] text-muted-foreground">
                {scanId
                  ? "This plan comes from your free scan, not a full report. Pick the repository it should fix — you see the exact diff before anything is written, and applying the fixes needs a plan."
                  : "Pick a completed report and the repository it should fix. You see the exact diff before anything is written."}
              </p>
            </div>
            {completedReports.length === 0 && !scanId ? (
              <p className="text-[14px] text-muted-foreground">
                No completed reports yet.{" "}
                <Link href="/app/new/" className="text-primary underline underline-offset-4">
                  Analyze your site first
                </Link>
                .
              </p>
            ) : (
              <NewRunForm
                reports={completedReports.map((j) => ({ id: j.id, site: j.siteUrl, date: j.createdAt }))}
                repos={activeConnection.repos ?? []}
                killSwitch={cfg.killSwitch}
                scanId={scanId}
              />
            )}
          </section>

          <PrChecksPanel repos={activeConnection.repos ?? []} defaultSiteUrl={completedReports[0]?.siteUrl} />
        </>
      )}

      {hub.disconnectResult && <DisconnectNotice result={hub.disconnectResult} />}

      <RunsTable jobs={jobs.data?.jobs ?? []} />
    </div>
  );
}

function RunsTable({ jobs }: { jobs: AgentJob[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="o-display text-xl">Recent runs</h2>
      </div>
      {jobs.length === 0 ? (
        <p className="px-5 py-6 text-[14px] text-muted-foreground">
          No runs yet. Your first pull request shows up here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b text-start font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                <th className="px-5 py-2.5 text-start font-medium">Repository</th>
                <th className="px-5 py-2.5 text-start font-medium">Status</th>
                <th className="px-5 py-2.5 text-start font-medium">Started</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 10).map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="px-5 py-3 font-mono text-[12.5px]" dir="ltr">
                    {j.input?.targetRepo ?? j.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3">
                    <RunStatus status={j.status} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDateTime(j.created_at)}</td>
                  <td className="px-5 py-3 text-end">
                    <Link
                      href={`/app/agent/job/${j.id}`}
                      className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
                    >
                      Open <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RunStatus({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "ok"
      : status === "failed" || status === "killed"
        ? "problem"
        : status === "awaiting_approval"
          ? "live"
          : "neutral";
  return (
    <LivePill tone={tone} pulse={status === "awaiting_approval"}>
      {statusLine(status)}
    </LivePill>
  );
}

function DisconnectNotice({ result }: { result: DisconnectResult }) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-2xl border p-5 text-[14px]",
        result.verified ? "border-tel-emerald/35 bg-tel-emerald/[0.06]" : "border-signal-amber/40 bg-card",
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        {result.verified ? (
          <>
            <ShieldCheck className="size-4 text-tel-emerald" aria-hidden /> Access removed and verified with GitHub
          </>
        ) : (
          <>
            <ShieldX className="size-4 text-signal-amber" aria-hidden /> One more step to fully remove access
          </>
        )}
      </p>
      <p className="text-muted-foreground">
        {result.verified
          ? "GitHub confirmed that Olmene can no longer reach your repositories."
          : "Olmene deleted its connection, but the Olmene GitHub app is still installed on your GitHub account, so GitHub would still let it create access tokens. Uninstall the app to remove access completely."}
      </p>
      {!result.verified && result.manualSteps.length > 0 && (
        <ol className="list-decimal space-y-1 ps-5 text-muted-foreground">
          {result.manualSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {!result.verified && (
        <div>
          <Button asChild variant="hairline" size="sm">
            <a href={result.uninstallUrl} target="_blank" rel="noreferrer">
              Open GitHub applications <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

function NewRunForm({
  reports,
  repos,
  killSwitch,
  scanId,
}: {
  reports: Array<{ id: string; site: string; date: string }>;
  repos: string[];
  killSwitch: boolean;
  /** Present when arriving from a free scan ("Preview the fix"). */
  scanId?: string | null;
}) {
  const initial = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("report") : null;
  const [reportId, setReportId] = useState(
    initial && reports.some((r) => r.id === initial) ? initial : (reports[0]?.id ?? ""),
  );
  const [repo, setRepo] = useState(repos[0] ?? "");
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const { startAgentJob, startAgentJobFromScan } = await import("@/lib/agent-client");
      const { jobId } = scanId
        ? await startAgentJobFromScan(scanId, repo)
        : await startAgentJob(reportId, repo);
      window.location.href = `/app/agent/job/${jobId}`;
    } catch (e) {
      if (e instanceof AgentApiError && e.code === "rate_limited") {
        toast.error("That's the three free previews for today — they reset at midnight.", {
          description: "A plan removes the limit and lets you merge fixes.",
          duration: 10000,
          action: { label: "See plans", onClick: () => (window.location.href = "/pricing/") },
        });
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not start the run. Try again.");
      }
      setStarting(false);
    }
  }

  const select =
    "h-11 w-full rounded-[10px] border border-line-strong bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (scanId) {
    // Scan mode: no report picker — the plan is built from the saved free scan.
    return (
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-[13px]" htmlFor="run-repo">
          <span className="text-muted-foreground">Repository</span>
          <select id="run-repo" value={repo} onChange={(e) => setRepo(e.target.value)} className={select}>
            {repos.length === 0 && <option value="">Install the app on a repository first</option>}
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <Button variant="sheen" size="xl" onClick={start} disabled={!repo || killSwitch}>
          {starting ? "Starting…" : "Preview fixes from this scan"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1.5 text-[13px]" htmlFor="run-report">
        <span className="text-muted-foreground">Report</span>
        <select id="run-report" value={reportId} onChange={(e) => setReportId(e.target.value)} className={select}>
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.site} — {fmtDateTime(r.date)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-[13px]" htmlFor="run-repo">
        <span className="text-muted-foreground">Repository</span>
        <select id="run-repo" value={repo} onChange={(e) => setRepo(e.target.value)} className={select}>
          {repos.length === 0 && <option value="">Install the app on a repository first</option>}
          {repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <Button variant="sheen" size="xl" onClick={start} disabled={starting || !reportId || !repo || killSwitch}>
        {starting ? "Starting…" : "Start fix run"}
      </Button>
    </div>
  );
}
