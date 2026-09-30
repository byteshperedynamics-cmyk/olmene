"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  Github,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogoLoader } from "@/components/logo-loader";
import {
  AgentApiError,
  connectGithub,
  disconnectGithub,
  featureAgentEnabled,
  getAgentConfig,
  getAgentJobs,
  registerGithubApp,
  type AgentConnection,
} from "@/lib/agent-client";
import { listJobs } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";

export default function AgentPage() {
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("registered") === "1") toast.success("GitHub App registered. Connect your account to continue.");
    if (p.get("registered") === "0") toast.error("App registration did not complete. Please try again.");
    if (p.get("connected") === "0") {
      const reason = p.get("reason");
      toast.error(
        reason === "not_installed"
          ? "You authorized MarketWise but no installation was found. Install the app on your site's repository, then reconnect."
          : "GitHub connect did not complete. Please try again.",
      );
    }
  }, []);

  const { data: config, isLoading, error: configError, refetch } = useQuery({
    queryKey: ["agent-config"],
    queryFn: getAgentConfig,
    retry: 1,
  });
  const { data: jobs } = useQuery({ queryKey: ["agent-jobs"], queryFn: getAgentJobs });
  const { data: reports } = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs() });

  const activeConnection: AgentConnection | undefined = useMemo(
    () => config?.github.connections.find((c) => c.status === "active"),
    [config],
  );

  async function onRegisterApp() {
    setBusy("register");
    try {
      const { url } = await registerGithubApp();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start registration.");
      setBusy(null);
    }
  }

  async function onConnect() {
    setBusy("connect");
    try {
      const { url } = await connectGithub();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start the connect flow.");
      setBusy(null);
    }
  }

  async function onDisconnect() {
    if (!activeConnection) return;
    setBusy("disconnect");
    try {
      const res = await disconnectGithub(activeConnection.id);
      if (res.verified) {
        toast.success("Disconnected. Verified with GitHub that the credential is dead.");
      } else {
        toast.warning("We deleted the connection, but the GitHub App is still installed on your GitHub account.", {
          description: "Finish revocation with the steps shown below.",
          duration: 12000,
        });
      }
      setDisconnectResult(res);
      await refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not disconnect.");
    } finally {
      setBusy(null);
    }
  }

  const [disconnectResult, setDisconnectResult] = useState<{
    verified: boolean;
    evidence: Record<string, unknown>;
    manualSteps: string[];
    uninstallUrl: string;
  } | null>(null);

  if (!featureAgentEnabled()) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Bot className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">The fix agent is not enabled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This deployment has the agent feature turned off. It will be enabled soon.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link href="/app/">Back to analyses</Link>
        </Button>
      </div>
    );
  }

  if (configError) {
    const msg =
      configError instanceof AgentApiError && configError.code === "agent_disabled"
        ? "The agent is not enabled on the server side of this deployment."
        : "Could not load the agent status. Check your connection and try again.";
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Bot className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">Agent unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        <Button asChild variant="outline" size="sm" className="mt-6" onClick={() => refetch()}>
          <Link href="/app/agent/">Retry</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || !config) {
    return (
      <div className="grid place-items-center py-24">
        <LogoLoader size={44} glow />
      </div>
    );
  }

  const completedReports = (reports ?? []).filter((j) => j.status === "completed");
  const entitlement = config.entitlement;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fix agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            MarketWise turns your report into ready-to-review pull requests. You approve every change before anything
            is written.
          </p>
        </div>
        {entitlement.allowed ? (
          <Badge className="border-emerald-600/30 bg-emerald-600/10 text-emerald-500" variant="outline">
            <Sparkles className="mr-1 size-3" aria-hidden />
            {entitlement.planName} · {entitlement.remaining} of {entitlement.limit} applies left
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Plan + preview free · apply needs a subscription
          </Badge>
        )}
      </header>

      {config.killSwitch && (
        <Card className="border-amber-600/30 bg-amber-600/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldX className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="font-medium">The agent is temporarily paused by the operator.</p>
              <p className="text-muted-foreground">Existing pull requests are unaffected. Check back shortly.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — GitHub connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Github className="size-4" aria-hidden /> 1 · Connect GitHub
          </CardTitle>
          <CardDescription>
            A GitHub App with two permissions only: <strong>Contents</strong> and <strong>Pull requests</strong> (write).
            It never pushes your default branch and can be uninstalled at any time — we verify access is really gone
            when you disconnect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!config.github.configured ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                First time setup (once per MarketWise account): register the MarketWise GitHub App under your GitHub
                account. GitHub shows you the exact permissions before anything is created.
              </p>
              <Button onClick={onRegisterApp} disabled={busy !== null || config.killSwitch}>
                {busy === "register" ? "Opening GitHub…" : "Register the GitHub App"}
              </Button>
            </div>
          ) : activeConnection ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-500" aria-hidden />
                <div>
                  <p className="text-sm font-medium">
                    Connected as <span className="font-mono">{activeConnection.account}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeConnection.repos?.length ?? 0} repos accessible · verified{" "}
                    {activeConnection.lastVerifiedAt ? fmtDateTime(activeConnection.lastVerifiedAt) : "at connect"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onDisconnect} disabled={busy !== null}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect & verify"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The app is registered. Connect it to the GitHub account that owns your site — GitHub will ask you to
                install it on your repository in the same step.
              </p>
              <Button onClick={onConnect} disabled={busy !== null || config.killSwitch}>
                {busy === "connect" ? "Opening GitHub…" : "Connect GitHub"}
              </Button>
            </div>
          )}

          {disconnectResult && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                disconnectResult.verified
                  ? "border-emerald-600/30 bg-emerald-600/5"
                  : "border-amber-600/30 bg-amber-600/5"
              }`}
            >
              <p className="flex items-center gap-2 font-medium">
                {disconnectResult.verified ? (
                  <>
                    <ShieldCheck className="size-4 text-emerald-500" aria-hidden /> Revocation verified
                  </>
                ) : (
                  <>
                    <ShieldX className="size-4 text-amber-500" aria-hidden /> One more step to fully revoke
                  </>
                )}
              </p>
              <p className="mt-1 text-muted-foreground">
                {String(disconnectResult.evidence.outcome ?? "Verification recorded.")}
              </p>
              {!disconnectResult.verified && disconnectResult.manualSteps.length > 0 && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  {disconnectResult.manualSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {!disconnectResult.verified && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={disconnectResult.uninstallUrl} target="_blank" rel="noreferrer">
                    Open GitHub applications <ExternalLink className="ml-1 size-3" aria-hidden />
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — start a fix job */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="size-4" aria-hidden /> 2 · Apply a report
          </CardTitle>
          <CardDescription>
            Pick a completed report and the repository it should fix. You will see an exact diff of every change
            before anything is written — and nothing merges without you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeConnection ? (
            <p className="text-sm text-muted-foreground">Connect GitHub above to start.</p>
          ) : completedReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed reports yet.{" "}
              <Link href="/app/new/" className="underline underline-offset-4">
                Run an analysis first
              </Link>
              .
            </p>
          ) : (
            <NewJobForm
              reports={completedReports.map((j) => ({ id: j.id, site: j.siteUrl, date: j.createdAt }))}
              repos={activeConnection.repos ?? []}
              killSwitch={config.killSwitch}
              initialReportId={new URLSearchParams(window.location.search).get("report") ?? undefined}
            />
          )}
        </CardContent>
      </Card>

      {/* Step 3 — job history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent fix jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobs?.jobs?.length ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {jobs.jobs.slice(0, 8).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{j.input?.targetRepo ?? j.id}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(j.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={j.status} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/agent/job/${j.id}`}>
                        Open <ArrowRight className="ml-1 size-3" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-500"
      : status === "failed" || status === "killed"
        ? "border-red-600/30 bg-red-600/10 text-red-500"
        : status === "canceled"
          ? "border-border bg-muted text-muted-foreground"
          : "border-amber-600/30 bg-amber-600/10 text-amber-500";
  return (
    <Badge variant="outline" className={`${cls} font-mono text-[11px]`}>
      {status}
    </Badge>
  );
}

function NewJobForm({
  reports,
  repos,
  killSwitch,
  initialReportId,
}: {
  reports: Array<{ id: string; site: string; date: string }>;
  repos: string[];
  killSwitch: boolean;
  initialReportId?: string;
}) {
  const [reportId, setReportId] = useState(
    initialReportId && reports.some((r) => r.id === initialReportId) ? initialReportId : (reports[0]?.id ?? ""),
  );
  const [repo, setRepo] = useState(repos[0] ?? "");
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const { startAgentJob } = await import("@/lib/agent-client");
      const { jobId } = await startAgentJob(reportId, repo);
      window.location.href = `/app/agent/job/${jobId}`;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start the job.");
      setStarting(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block text-sm">
        <span className="mb-1.5 block text-muted-foreground">Report</span>
        <select
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.site} — {fmtDateTime(r.date)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-muted-foreground">Repository</span>
        <select
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {repos.length === 0 && <option value="">(install the app on a repo first)</option>}
          {repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={start} disabled={starting || !reportId || !repo || killSwitch}>
        {starting ? "Starting…" : "Start fix job"}
      </Button>
    </div>
  );
}
