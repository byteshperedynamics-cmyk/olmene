"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ExternalLink, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditRow, JobState, PlannedAction } from "@/lib/agent-client";
import type { LiveCheckResult, LiveCheckState } from "@/lib/agent/live-check";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flower } from "@/components/v2/flower";
import { Eyebrow, LivePill } from "@/components/v2/atoms";
import { DiffView } from "@/components/v2/diff-view";
import { StepRail, type RailStep, type StepState } from "@/components/v2/step-rail";
import {
  ACTIVE_JOB_STATUSES,
  RUN_STEPS,
  TERMINAL_JOB_STATUSES,
  fixerImpact,
  fixerLabel,
  statusLine,
} from "./fixers";

/** The fixes checked on the PR's preview deployment, before merge (engine sync). */
export interface PreviewCheckState {
  sha: string;
  checkedAt: string;
  available: boolean;
  reason?: string;
  url?: string;
  passed?: number;
  total?: number;
  results?: LiveCheckResult[];
}

/** Pure presentation of a fix run — also rendered by the dev gallery with example states. */
export function JobView({
  state,
  checked,
  onToggle,
  busy,
  onApprove,
  onReject,
  onCancel,
}: {
  state: JobState;
  checked: Set<string>;
  onToggle: (id: string) => void;
  busy: string | null;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const data = state;
  const id = state.job.id;
  const toggle = onToggle;
  const { job, actions, audit } = data;
  const viable = (actions ?? []).filter((a) => a.status === "planned" && a.preview);
  const skipped = (actions ?? []).filter((a) => a.status === "skipped");
  const applied = (actions ?? []).filter((a) => a.status === "applied");
  const applyOut = job.step_outputs?.apply as
    | { prUrl?: string; prNumber?: number; branch?: string; files?: string[] }
    | undefined;
  const active = ACTIVE_JOB_STATUSES.includes(job.status);
  const terminal = TERMINAL_JOB_STATUSES.includes(job.status);
  const repo = job.input?.targetRepo ?? "";

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Link
            href="/app/agent/"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl-flip" aria-hidden /> Fix runs
          </Link>
          <h1 className="o-display text-[32px] leading-tight">Fix run</h1>
          <p className="font-mono text-[12px] text-muted-foreground" dir="ltr">
            {repo} · started {fmtDateTime(job.created_at)}
          </p>
        </div>
        {active && (
          <Button variant="hairline" onClick={onCancel} disabled={busy !== null}>
            {busy === "cancel" ? "Canceling…" : "Cancel run"}
          </Button>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <RunRail status={job.status} currentStep={job.current_step} repo={repo} audit={audit ?? []} />

        <div key={job.status} className="o-crossfade grid min-w-0 gap-5">
          {job.error && <ErrorBanner status={job.status} message={job.error} prOpened={Boolean(applyOut?.prUrl)} />}

          {(job.status === "queued" || job.status === "planning" || job.status === "previewing") && <DraftingState />}

          {job.status === "awaiting_approval" && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="o-display text-2xl">
                  {viable.length} proposed {viable.length === 1 ? "change" : "changes"}
                </h2>
                <p className="text-[13px] text-muted-foreground">Nothing is written until you approve.</p>
              </div>
              <div className="grid gap-4">
                {viable.map((a, i) => (
                  <ActionCard
                    key={a.id}
                    action={a}
                    checked={checked.has(a.id)}
                    onToggle={() => toggle(a.id)}
                    defaultOpen={i < 2}
                  />
                ))}
              </div>
              {skipped.length > 0 && <SkippedList actions={skipped} />}
              <ApproveBar
                branch={`olmene/fix-${job.id.slice(0, 8)}-a1`}
                selected={checked.size}
                total={viable.length}
                busy={busy}
                onApprove={onApprove}
                onReject={onReject}
              />
            </>
          )}

          {(job.status === "applying" || job.status === "verifying") && (
            <div className="grid gap-3 rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <Flower size={28} variant="breathe" />
                <p className="text-[15px] font-medium" aria-live="polite">
                  {statusLine(job.status)}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="relative h-full w-2/3 rounded-full bg-primary">
                  <span className="absolute inset-0 animate-progress-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </div>
              </div>
            </div>
          )}

          {applyOut?.prUrl && (
            <div className="grid gap-4 rounded-2xl border border-tel-emerald/35 bg-tel-emerald/[0.06] p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <Flower size={36} variant="bloom-once" />
                <div className="min-w-0">
                  <p className="o-display text-2xl">
                    {job.pr_state === "merged"
                      ? `Pull request #${applyOut.prNumber} was merged`
                      : job.pr_state === "closed"
                        ? `Pull request #${applyOut.prNumber} was closed without merging`
                        : `Pull request #${applyOut.prNumber} is open`}
                  </p>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    {applied.length} {applied.length === 1 ? "fix" : "fixes"} on{" "}
                    <code className="font-mono text-[12px]" dir="ltr">
                      {applyOut.branch}
                    </code>
                    {job.pr_state === "merged"
                      ? ". Olmene checks your live site after the merge, then again every week."
                      : job.pr_state === "closed"
                        ? ". Nothing was merged, so nothing changed on your site."
                        : ". Review and merge it on GitHub; Olmene then checks your live site to confirm each fix is live."}
                  </p>
                </div>
              </div>
              {applyOut.files?.length ? (
                <div className="flex flex-wrap gap-1.5" dir="ltr">
                  {applyOut.files.map((f) => (
                    <span key={f} className="rounded-md border bg-card px-2 py-0.5 font-mono text-[11px]">
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="sheen" size="xl">
                  <a href={applyOut.prUrl} target="_blank" rel="noreferrer">
                    Review on GitHub <ExternalLink className="size-4" aria-hidden />
                  </a>
                </Button>
                <Button asChild variant="hairline" size="xl">
                  <Link href={`/app/agent/job/${id}/receipt`}>
                    View receipt <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {job.pr_state === "merged" && (
            <LiveCheckPanel state={job.step_outputs?.liveCheck as LiveCheckState | undefined} mergedAt={job.merged_at ?? null} />
          )}

          {applyOut?.prUrl && <PreviewCheckPanel out={job.step_outputs?.previewCheck as PreviewCheckState | undefined} />}

          {terminal && !applyOut?.prUrl && job.status === "completed" && (
            <StateMessage
              inline
              title="Nothing was changed"
              body="This run finished without opening a pull request. Either you declined the changes or there was nothing Olmene could fix with confidence."
            />
          )}

          <AuditLog audit={audit ?? []} />
        </div>
      </div>
    </div>
  );
}

/* ── Rail ─────────────────────────────────────────────────────────────── */

function RunRail({
  status,
  currentStep,
  repo,
  audit,
}: {
  status: string;
  currentStep: string | null;
  repo: string;
  audit: AuditRow[];
}) {
  const steps: RailStep[] = useMemo(() => {
    const idx = Math.max(
      0,
      RUN_STEPS.findIndex((s) => s.id === currentStep),
    );
    const failed = ["failed", "killed", "canceled"].includes(status);
    const startOf = (stepId: string) => audit.find((r) => r.action_type === stepId)?.created_at;
    return RUN_STEPS.map((s, i) => {
      let state: StepState = "pending";
      if (status === "completed") state = "done";
      else if (i < idx) state = "done";
      else if (i === idx) state = failed ? "failed" : "now";
      const started = startOf(s.id);
      const meta = state === "now" ? "now" : started ? new Date(started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined;
      return { key: s.id, label: s.label, state, meta };
    });
  }, [status, currentStep, audit]);

  const working = ACTIVE_JOB_STATUSES.includes(status);
  return (
    <aside className="min-w-0 rounded-2xl border bg-card p-4 lg:sticky lg:top-20">
      <div className="mb-3 flex items-center gap-3 border-b pb-3">
        <Flower size={28} variant={working ? "breathe" : status === "completed" ? "bloom-once" : "static"} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium" aria-live="polite">
            {statusLine(status)}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
            {repo}
          </p>
        </div>
      </div>
      <StepRail steps={steps} className="hidden lg:grid" />
      <StepRail steps={steps} orientation="horizontal" className="lg:hidden" />
    </aside>
  );
}

/* ── Change card ──────────────────────────────────────────────────────── */

function ActionCard({
  action,
  checked,
  onToggle,
  defaultOpen,
}: {
  action: PlannedAction;
  checked: boolean;
  onToggle: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const impact = fixerImpact(action.fixer_id);
  const p = action.preview;
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-card transition-colors", checked && "border-rim shadow-[inset_0_1px_0_var(--edge-top)]")}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <input
          id={`act-${action.id}`}
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
          checked={checked}
          onChange={onToggle}
        />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`act-${action.id}`} className="cursor-pointer text-[15px] font-medium">
              {fixerLabel(action.fixer_id)}
            </label>
            <LivePill tone={impact === "high" ? "problem" : "neutral"}>{impact === "high" ? "high impact" : "medium"}</LivePill>
          </div>
          {p?.explanation && <p className="text-[14px] text-muted-foreground">{p.explanation}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide the diff" : "Show the diff"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-[var(--dur-state)]", open && "rotate-180")} />
        </button>
      </div>
      {open && p && (
        <div className="grid gap-4 border-t px-4 pb-5 pt-4 sm:px-5">
          {p.edits.length > 0 && (
            <DiffView files={p.edits.map((e) => ({ path: e.path, diff: e.diff, isNewFile: e.isNewFile }))} />
          )}
          <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
            <div>
              <dt className="o-eyebrow">Evidence</dt>
              <dd className="mt-1 text-muted-foreground">{p.evidence}</dd>
            </div>
            <div>
              <dt className="o-eyebrow">Expected change</dt>
              <dd className="mt-1 text-muted-foreground">{p.expectedScoreChange}</dd>
            </div>
          </dl>
          {p.revertSteps?.length > 0 && (
            <details className="group rounded-xl border bg-background/40 px-4 py-3 text-[13.5px]">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
                <Undo2 className="size-3.5" aria-hidden /> How to undo this
              </summary>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-muted-foreground">
                {p.revertSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SkippedList({ actions }: { actions: PlannedAction[] }) {
  return (
    <details className="rounded-2xl border border-dashed px-5 py-4 text-[13.5px]">
      <summary className="cursor-pointer text-muted-foreground">
        {actions.length} {actions.length === 1 ? "fix was" : "fixes were"} skipped, because Olmene wasn&apos;t sure
      </summary>
      <ul className="mt-3 grid gap-2">
        {actions.map((a) => (
          <li key={a.id} className="grid gap-0.5">
            <span className="font-medium">{fixerLabel(a.fixer_id)}</span>
            <span className="text-muted-foreground">{a.skip_reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ApproveBar({
  branch,
  selected,
  total,
  busy,
  onApprove,
  onReject,
}: {
  branch: string;
  selected: number;
  total: number;
  busy: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-card/95 px-4 py-3 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.5)] backdrop-blur sm:px-5">
      <p className="min-w-0 text-[12.5px] text-muted-foreground">
        Opens a pull request on{" "}
        <code className="font-mono text-[11.5px] text-foreground" dir="ltr">
          {branch}
        </code>
        . Nothing merges without you. <span className="font-mono">{selected}/{total} selected</span>
      </p>
      <div className="flex gap-2">
        <Button variant="hairline" onClick={onReject} disabled={busy !== null}>
          {busy === "reject" ? "Declining…" : "Decline all"}
        </Button>
        <Button variant="sheen" onClick={onApprove} disabled={busy !== null || selected === 0}>
          {busy === "approve" ? "Approving…" : `Approve ${selected} ${selected === 1 ? "change" : "changes"}`}
        </Button>
      </div>
    </div>
  );
}

/* ── States ───────────────────────────────────────────────────────────── */

function DraftingState() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Flower size={24} variant="breathe" />
        <p className="text-[15px] font-medium">Olmene is reading your repository and drafting changes</p>
      </div>
      <div className="grid gap-3 rounded-2xl border bg-card p-5" aria-hidden>
        <div className="o-skeleton h-4 w-1/3 rounded" />
        <div className="o-skeleton h-3 w-2/3 rounded" />
        <div className="mt-2 grid gap-1.5">
          {[90, 70, 80, 60, 75].map((w, i) => (
            <div key={i} className="o-skeleton h-3 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ status, message, prOpened }: { status: string; message: string; prOpened: boolean }) {
  const title =
    status === "killed"
      ? "A safety switch stopped this run"
      : status === "failed"
        ? "This run stopped before finishing"
        : "Heads up";
  const next =
    status === "killed"
      ? "No changes were written. Fix runs are paused for your account; contact support if this is unexpected."
      : status === "failed"
        ? prOpened
          ? "The pull request below was opened, but Olmene's final check did not match it. Review it on GitHub before merging, or start a new run."
          : "No pull request was opened. You can start a new run from the fix runs page."
        : null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-signal-rust/40 bg-diff-del p-5 text-[14px]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-rust" aria-hidden />
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{message}</p>
        {next && <p className="text-muted-foreground">{next}</p>}
      </div>
    </div>
  );
}

function AuditLog({ audit }: { audit: AuditRow[] }) {
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <Eyebrow>Action log</Eyebrow>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            Everything the agent did, as it happened. Secrets never appear here.
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="max-h-96 overflow-y-auto border-t px-5 py-3 text-[13px]">
        {audit.map((row) => (
          <li key={row.id} className="flex items-start gap-3 border-b py-2 last:border-0">
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px]",
                row.result === "success"
                  ? "bg-tel-emerald/10 text-tel-emerald"
                  : row.result === "blocked" || row.result === "failure"
                    ? "bg-diff-del text-signal-rust"
                    : "bg-surface-2 text-muted-foreground",
              )}
            >
              {row.action_type}
            </span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              {row.actor} · {fmtDateTime(row.created_at)}
              {row.detail && typeof row.detail === "object" && "reason" in row.detail && (
                <span> — {String((row.detail as Record<string, unknown>).reason).slice(0, 160)}</span>
              )}
            </span>
          </li>
        ))}
        {audit.length === 0 && <li className="py-2 text-muted-foreground">Waiting for the first step…</li>}
      </ul>
    </details>
  );
}

export function StateMessage({
  title,
  body,
  action,
  inline,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={cn("mx-auto grid max-w-xl justify-items-center gap-3 text-center", inline ? "py-8" : "py-24")}>
      <Flower size={32} />
      <p className="o-display text-2xl">{title}</p>
      <p className="text-[14px] text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

/**
 * Preview verification (engine sync): the fixes were checked on the pull
 * request's preview deployment BEFORE merge. all-pass is the "Verified on
 * your preview: 3/3" trust moment; available:false means the GitHub App
 * lacks the Deployments permission (an owner setting), not a failure.
 */
function PreviewCheckPanel({ out }: { out: PreviewCheckState | undefined }) {
  if (!out) return null;

  if (!out.available) {
    return (
      <div className="grid gap-1 rounded-2xl border bg-card p-5 text-[14px]">
        <p className="font-medium">Preview verification isn&apos;t available for this repository</p>
        <p className="text-[13px] text-muted-foreground">
          {out.reason ??
            "The Olmene GitHub App is missing the Deployments permission, so no preview deployment could be read."}{" "}
          Your fixes are still checked on the live site after you merge.
        </p>
      </div>
    );
  }

  if (out.passed === undefined || out.total === undefined) return null;
  const all = out.passed === out.total;

  return (
    <div className={cn("grid gap-3 rounded-2xl border p-5", all ? "border-tel-emerald/35 bg-tel-emerald/[0.06]" : "border-signal-amber/40 bg-card")}>
      <div className="flex items-start gap-3">
        {all ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-tel-emerald" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-signal-amber" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-medium">
            {all
              ? `Verified on your preview: ${out.passed}/${out.total}`
              : `${out.passed} of ${out.total} fixes verified on your preview`}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Checked {fmtDateTime(out.checkedAt)} against the pull request&apos;s preview deployment — before you merge.
            {out.url && (
              <>
                {" "}
                <a href={out.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Open preview <ExternalLink className="inline size-3" aria-hidden />
                </a>
              </>
            )}
          </p>
        </div>
      </div>
      {out.results && out.results.length > 0 && (
        <ul className="grid gap-2">
          {out.results.map((r) => (
            <li key={r.fixer} className="flex items-start gap-3 text-[14px]">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-tel-emerald" aria-label="Verified" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-amber" aria-label="Not verified" />
              )}
              <span className="min-w-0">
                <span className="font-medium">{r.label}</span>
                <span className="block text-[13px] text-muted-foreground">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveCheckPanel({ state, mergedAt }: { state: LiveCheckState | undefined; mergedAt: string | null }) {
  const last = state?.last;
  if (!last) {
    return (
      <div className="grid gap-1 rounded-2xl border bg-card p-6 text-[14px]">
        <p className="font-medium">Checking your live site</p>
        <p className="text-muted-foreground">
          Olmene checks your public site about 10–20 minutes after the merge{mergedAt ? ` (merged ${fmtDateTime(mergedAt)})` : ""}, so your
          deploy has time to finish. Results appear here.
        </p>
      </div>
    );
  }
  const allLive = last.total > 0 && last.passed === last.total;
  return (
    <div className={cn("grid gap-4 rounded-2xl border p-6", allLive ? "border-tel-emerald/35 bg-tel-emerald/[0.06]" : "bg-card")}>
      <div className="grid gap-1">
        <p className="o-display text-2xl">
          {last.fetchError
            ? "Your live site could not be reached"
            : allLive
              ? "Every merged fix is live"
              : `${last.passed} of ${last.total} merged fixes are live`}
        </p>
        <p className="text-[13px] text-muted-foreground">
          Checked {fmtDateTime(last.checkedAt)} on <span dir="ltr">{last.siteUrl}</span>
          {!state?.settled && !allLive ? " · checking again every 10 minutes for the first day" : " · re-checked weekly"}
        </p>
      </div>
      {last.regressed.length > 0 && (
        <p role="alert" className="rounded-lg border border-signal-rust/40 bg-diff-del px-3 py-2 text-[13px]">
          Something regressed since the last check: {last.results.filter((r) => last.regressed.includes(r.fixer)).map((r) => r.label).join(", ")}.
        </p>
      )}
      {last.fetchError ? (
        <p className="text-[13px] text-muted-foreground">Olmene will try again on the next check ({last.fetchError}).</p>
      ) : (
        <ul className="grid gap-2">
          {last.results.map((r) => (
            <li key={r.fixer} className="flex items-start gap-3 text-[14px]">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-tel-emerald" aria-label="Live" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-amber" aria-label="Not live yet" />
              )}
              <span className="min-w-0">
                <span className="font-medium">{r.label}</span>
                <span className="block text-[13px] text-muted-foreground">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
