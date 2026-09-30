"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentConsole, AnalysisCompleteBanner } from "@/components/agent-console";
import { ReportViewer } from "@/components/report-viewer";
import { advanceAnalysis } from "@/lib/api";
import { getJob, getReportByJobId, type Job } from "@/lib/data";
import { STEPS, waitReasonMessage, JOB_STATUS } from "@/lib/steps";
import { fmtDateTime } from "@/lib/format";
import { ADVANCE_MAX_BACKOFF_MS, WAIT_POLL_MS } from "@/lib/config";

/** Drives the pipeline: calls advance-analysis in a loop while the job runs. */
function useAdvance(jobId: string | null, getJobRef: () => Job | null) {
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stoppedRef.current = false;
    if (!jobId) return;

    let backoff = 1000;
    const schedule = (ms: number) => {
      if (stoppedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, ms);
    };
    const tick = async () => {
      if (stoppedRef.current) return;
      const job = getJobRef();
      if (!job) return schedule(1000);
      if (job.status === "completed" || job.status === "failed" || job.status === "canceled") return;
      if (job.waitReason) return schedule(WAIT_POLL_MS);
      try {
        await advanceAnalysis(jobId);
        backoff = 1000;
        schedule(500);
      } catch {
        backoff = Math.min(backoff * 2, ADVANCE_MAX_BACKOFF_MS);
        schedule(backoff);
      }
    };
    tick();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, getJobRef]);
}

function ReportPageInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const [jobState, setJobState] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const onState = useCallback((updater: (j: Job | null) => Job | null) => {
    setJobState((prev) => {
      const next = updater(prev);
      jobRef.current = next;
      return next;
    });
  }, []);
  const getJobRef = useCallback(() => jobRef.current, []);

  useAdvance(id, getJobRef);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => getJob(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const d = q.state.data;
      return !!d && (d.status === "queued" || d.status === "running") ? 1500 : false;
    },
  });
  useEffect(() => {
    if (job) onState(() => job);
  }, [job, onState]);

  const { data: report } = useQuery({
    queryKey: ["report", id],
    queryFn: () => getReportByJobId(id!),
    enabled: !!id && jobState?.status === "completed",
  });

  if (!id) {
    return <p className="text-muted-foreground">Missing analysis id. <Link className="underline" href="/app/">Back to analyses</Link></p>;
  }

  if (isLoading && !jobState) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!jobState) {
    return <p className="text-muted-foreground">Analysis not found. <Link className="underline" href="/app/">Back to analyses</Link></p>;
  }

  const status = JOB_STATUS[jobState.status] ?? JOB_STATUS.queued;
  const waitMsg = waitReasonMessage(jobState.waitReason);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight">
            {jobState.productName || (jobState.siteUrl ? safeHost(jobState.siteUrl) : "Analysis")}
          </h1>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{safeHost(jobState.siteUrl)}</p>
        </div>
        {(jobState.status === "queued" || jobState.status === "running") ? (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium status-running">
            <span className="size-1.5 animate-soft-pulse rounded-full bg-primary" aria-hidden />
            {status.label}
          </span>
        ) : (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
        )}
      </div>

      {/* Running / queued: the agent console */}
      <AnimatePresence initial={false}>
        {(jobState.status === "queued" || jobState.status === "running") && (
          <motion.div
            key="console"
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <AgentConsole job={jobState} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Failed */}
      {jobState.status === "failed" && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6"
        >
          <p className="font-medium text-destructive">The analysis failed</p>
          <p className="mt-1.5 text-sm text-foreground/80">
            {jobState.error ?? "An unexpected error occurred."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Failed analyses never count against your quota.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/app/new/">Start a new analysis</Link>
          </Button>
        </motion.div>
      )}

      {/* Completed: one calm arrival, then the report */}
      {jobState.status === "completed" && (
        report ? (
          <div className="space-y-6">
            <div className="print:hidden">
              <AnalysisCompleteBanner job={jobState} />
              {process.env.NEXT_PUBLIC_FEATURE_AGENT === "true" && report.data.meta?.siteUrl && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Want the agent to apply these fixes?</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Connect your repository and get a reviewable pull request — you approve every change.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/app/agent/?report=${encodeURIComponent(id ?? "")}`}>
                      Apply fixes with the agent
                    </Link>
                  </Button>
                </div>
              )}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mb-4 text-sm text-muted-foreground print:hidden">
                Completed {fmtDateTime(jobState.completedAt)} ·{" "}
                <span className="font-medium text-foreground">{report.title}</span>
              </p>
              <ReportViewer data={report.data} />
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            <AnalysisCompleteBanner job={jobState} />
            <div className="space-y-4">
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        )
      )}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function ReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReportPageInner />
    </Suspense>
  );
}
