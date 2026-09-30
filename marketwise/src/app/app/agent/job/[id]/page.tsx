"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  GitPullRequest,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogoLoader } from "@/components/logo-loader";
import {
  AgentApiError,
  advanceAgentJob,
  approveAgentJob,
  cancelAgentJob,
  featureAgentEnabled,
  getAgentJob,
  rejectAgentJob,
  type PlannedAction,
} from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";

const STEP_FLOW = [
  { id: "plan", label: "Plan" },
  { id: "preview", label: "Preview" },
  { id: "await_approval", label: "Your approval" },
  { id: "apply", label: "Apply" },
  { id: "verify", label: "Verify" },
  { id: "done", label: "Done" },
];

const ACTIVE_JOB_STATUSES = ["queued", "planning", "previewing", "applying", "verifying"];

export default function AgentJobPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ["agent-job", id],
    queryFn: () => getAgentJob(id),
    enabled: !!id && featureAgentEnabled(),
    retry: 1,
    refetchInterval: (q) => {
      const st = q.state.data?.job.status;
      return st && ACTIVE_JOB_STATUSES.includes(st) ? 1500 : false;
    },
  });

  // Driver loop: advance one unit at a time while the job is active.
  const statusRef = useRef<string | null>(null);
  useEffect(() => {
    statusRef.current = data?.job.status ?? null;
  }, [data?.job.status]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    const tick = async () => {
      if (!alive) return;
      const st = statusRef.current;
      if (!st || st === "awaiting_approval" || !ACTIVE_JOB_STATUSES.includes(st)) return;
      try {
        await advanceAgentJob(id);
        backoff = 1000;
        await refetch();
        if (alive) timer = setTimeout(tick, 400);
      } catch {
        backoff = Math.min(backoff * 2, 15000);
        if (alive) timer = setTimeout(tick, backoff);
      }
    };
    timer = setTimeout(tick, 300);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, refetch, data?.job.status === "awaiting_approval"]);

  // Pre-check all viable actions once previews exist.
  useEffect(() => {
    if (data?.job.status === "awaiting_approval") {
      const viable = (data.actions ?? []).filter((a) => a.status === "planned" && a.preview);
      setChecked((prev) => (prev.size === 0 && viable.length > 0 ? new Set(viable.map((a) => a.id)) : prev));
    }
  }, [data?.job.status, data?.actions]);

  const toggle = (aid: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(aid)) next.delete(aid);
      else next.add(aid);
      return next;
    });

  async function onApprove() {
    setBusy("approve");
    try {
      const res = await approveAgentJob(id, [...checked]);
      toast.success(`Approved ${res.approved} fix${res.approved === 1 ? "" : "es"}. Applying now…`);
      await refetch();
    } catch (e) {
      if (e instanceof AgentApiError && (e.code === "plan_required" || e.code === "quota_exceeded")) {
        toast.error(e.message, { description: "Your plan and previews remain free.", duration: 10000 });
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not approve.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onReject() {
    setBusy("reject");
    try {
      await rejectAgentJob(id);
      toast("Declined — nothing was written to your repository.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not decline.");
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    setBusy("cancel");
    try {
      await cancelAgentJob(id);
      await refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  }

  if (!featureAgentEnabled()) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-muted-foreground">The fix agent is not enabled on this deployment.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm font-medium">Could not load this fix job.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {loadError instanceof AgentApiError ? loadError.message : "Check your connection and try again."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6" onClick={() => refetch()}>
          <Link href={`/app/agent/job/${id}`}>Retry</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid place-items-center py-24">
        <LogoLoader size={44} glow />
      </div>
    );
  }

  const { job, actions, audit } = data;
  const viable = (actions ?? []).filter((a) => a.status === "planned" && a.preview);
  const skipped = (actions ?? []).filter((a) => a.status === "skipped");
  const applied = (actions ?? []).filter((a) => a.status === "applied");
  const applyOut = job.step_outputs?.apply as
    | { prUrl?: string; prNumber?: number; branch?: string; files?: string[] }
    | undefined;
  const currentIdx = STEP_FLOW.findIndex((s) => s.id === job.current_step);
  const done = ["completed", "failed", "canceled", "killed"].includes(job.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="size-5" aria-hidden /> Fix job
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {job.input?.targetRepo} · started {fmtDateTime(job.created_at)}
          </p>
        </div>
        {!done && job.status !== "awaiting_approval" && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy !== null}>
            Cancel
          </Button>
        )}
      </header>

      {/* Step timeline */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" aria-label="Progress">
        {STEP_FLOW.map((s, i) => {
          const state = done && job.status === "completed" && s.id === "done" ? "done"
            : i < currentIdx ? "done"
            : i === currentIdx ? "active"
            : "todo";
          return (
            <li key={s.id} className="flex items-center gap-2">
              {state === "done" ? (
                <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
              ) : state === "active" ? (
                <Loader2 className="size-4 animate-spin text-amber-500" aria-hidden />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground/50" aria-hidden />
              )}
              <span className={state === "todo" ? "text-muted-foreground/60" : "font-medium"}>{s.label}</span>
              {i < STEP_FLOW.length - 1 && <span className="text-muted-foreground/30">→</span>}
            </li>
          );
        })}
      </ol>

      {job.error && (
        <Card className="border-red-600/30 bg-red-600/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
            <div>
              <p className="font-medium">{job.status === "failed" ? "The job failed" : "Warning"}</p>
              <p className="mt-0.5 text-muted-foreground">{job.error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval gate */}
      {job.status === "awaiting_approval" && (
        <Card className="border-amber-600/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-amber-500" aria-hidden />
              {viable.length} proposed {viable.length === 1 ? "change" : "changes"} — nothing is written until you
              approve
            </CardTitle>
            <CardDescription>
              Each fix is a reversible pull request on a <code className="font-mono text-xs">marketwise/fix-…</code>{" "}
              branch. Your default branch is never pushed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {viable.map((a) => (
              <ActionCard key={a.id} action={a} checked={checked.has(a.id)} onToggle={() => toggle(a.id)} />
            ))}
            {skipped.length > 0 && (
              <details className="rounded-lg border border-border/70 p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {skipped.length} {skipped.length === 1 ? "fix was" : "fixes were"} skipped (safely)
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {skipped.map((a) => (
                    <li key={a.id} className="flex gap-2 text-muted-foreground">
                      <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>
                        <span className="font-mono text-xs">{a.fixer_id}</span> — {a.skip_reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onApprove} disabled={busy !== null || checked.size === 0}>
                {busy === "approve" ? "Applying…" : `Approve ${checked.size} and open a PR`}
              </Button>
              <Button variant="outline" onClick={onReject} disabled={busy !== null}>
                {busy === "reject" ? "Declining…" : "Decline everything"}
              </Button>
              <span className="text-xs text-muted-foreground">{checked.size} of {viable.length} selected</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {applyOut?.prUrl && (
        <Card className="border-emerald-600/30 bg-emerald-600/5">
          <CardContent className="space-y-3 p-5">
            <p className="flex items-center gap-2 font-medium">
              <GitPullRequest className="size-4 text-emerald-500" aria-hidden />
              Pull request #{applyOut.prNumber} is open
            </p>
            <p className="text-sm text-muted-foreground">
              {applied.length} {applied.length === 1 ? "fix" : "fixes"} · branch{" "}
              <code className="font-mono text-xs">{applyOut.branch}</code>
              {applyOut.files?.length ? ` · ${applyOut.files.join(", ")}` : ""}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="sm">
                <a href={applyOut.prUrl} target="_blank" rel="noreferrer">
                  Review the PR <ExternalLink className="ml-1 size-3" aria-hidden />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/agent/job/${id}/receipt`}>
                  View receipt <ArrowRight className="ml-1 size-3" aria-hidden />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live audit feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action log</CardTitle>
          <CardDescription>Everything the agent did, as it happened. Secrets never appear here by design.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {(audit ?? []).map((row) => (
              <li key={row.id} className="flex items-start gap-2 border-b border-border/40 pb-2 last:border-0">
                <Badge
                  variant="outline"
                  className={`mt-0.5 shrink-0 font-mono text-[10px] ${
                    row.result === "success"
                      ? "border-emerald-600/30 text-emerald-500"
                      : row.result === "blocked" || row.result === "failure"
                        ? "border-red-600/30 text-red-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {row.action_type}
                </Badge>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {row.actor} · {fmtDateTime(row.created_at)}
                  {row.detail && typeof row.detail === "object" && "reason" in (row.detail as Record<string, unknown>) && (
                    <span> — {String((row.detail as Record<string, unknown>).reason).slice(0, 160)}</span>
                  )}
                </span>
              </li>
            ))}
            {(audit ?? []).length === 0 && <li className="text-muted-foreground">Waiting for the first step…</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ActionCard({
  action,
  checked,
  onToggle,
}: {
  action: PlannedAction;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/70">
      <label className="flex cursor-pointer items-start gap-3 p-4">
        <input type="checkbox" className="mt-1 size-4 accent-foreground" checked={checked} onChange={onToggle} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{action.fixer_id}</span>
            {action.preview?.edits.map((e) => (
              <Badge key={e.path} variant="outline" className="font-mono text-[10px]">
                {e.isNewFile ? "+ " : ""}
                {e.path}
              </Badge>
            ))}
          </div>
          <p className="text-sm">{action.preview?.explanation}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">Why:</span> {action.preview?.evidence}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">Expected:</span> {action.preview?.expectedScoreChange}
          </p>
          {action.preview?.edits.map((e) => (
            <pre
              key={e.path}
              className="max-h-64 overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-[11px] leading-relaxed"
              aria-label={`Diff for ${e.path}`}
            >
              {e.diff || "(no textual diff)"}
            </pre>
          ))}
        </div>
      </label>
    </div>
  );
}
