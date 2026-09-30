"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoLoader } from "@/components/logo-loader";
import { Reveal } from "@/components/motion";
import { listJobs, getEntitlement } from "@/lib/data";
import { STEPS, JOB_STATUS } from "@/lib/steps";
import { fmtDateTime } from "@/lib/format";

function QuotaCard() {
  const { data: ent } = useQuery({ queryKey: ["entitlement"], queryFn: getEntitlement });
  if (!ent) return null;
  const pct = ent.quotaTotal > 0 ? Math.min(100, Math.round((ent.quotaUsed / ent.quotaTotal) * 100)) : 100;
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            {ent.active ? `${ent.planName} plan` : "No active subscription"}
          </p>
          <p className="text-sm text-muted-foreground">
            {ent.active
              ? ent.quotaTotal > 0
                ? `${ent.quotaUsed} of ${ent.quotaTotal} reports used`
                : "Unlimited"
              : "Subscribe to run analyses"}
          </p>
        </div>
        {ent.active && ent.quotaTotal > 0 && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            {ent.renewsAt && (
              <p className="text-xs text-muted-foreground">
                Renews {fmtDateTime(ent.renewsAt)}
                {ent.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </p>
            )}
          </>
        )}
        {!ent.active && (
          <Button asChild size="sm">
            <Link href="/app/billing/">
              Subscribe to run analyses <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Hostname-only URL display — short, mobile-friendly, never overflows. */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function DashboardPage() {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: (q) => {
      const d = q.state.data;
      return !!d?.some((j) => j.status === "queued" || j.status === "running") ? 5000 : false;
    },
  });

  const hasActive = !!jobs?.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Your analyses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each report runs ten research steps and ends in a prioritized 90-day plan.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/new/">
            <Plus className="size-4" aria-hidden /> New analysis
          </Link>
        </Button>
      </div>

      <QuotaCard />

      {hasActive && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm" role="status">
          <LogoLoader size={18} glow className="shrink-0" />
          <p>An analysis is in progress — you can watch it on its report page, or close the tab; it keeps running.</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No analyses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Point Olmene at your website and get your first 90-day plan.
          </p>
          <Button asChild className="mt-5">
            <Link href="/app/new/">
              Start your first analysis <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job, i) => {
            const status = JOB_STATUS[job.status] ?? JOB_STATUS.queued;
            const stepIdx = STEPS.findIndex((s) => s.id === job.currentStep);
            const pct = job.status === "completed" ? 100 : job.status === "failed" || job.status === "canceled" ? 0 : Math.round(((stepIdx + 0.5) / STEPS.length) * 100);
            const live = job.status === "queued" || job.status === "running";
            return (
              <Reveal key={job.id} delay={Math.min(i * 0.06, 0.3)} y={12}>
                <Link
                  href={`/app/report/?id=${job.id}`}
                  className="card-lift block rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.productName || safeHost(job.siteUrl)}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{safeHost(job.siteUrl)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDateTime(job.createdAt)}
                        {job.status === "running" && job.currentStep
                          ? ` · ${STEPS.find((s) => s.id === job.currentStep)?.label ?? job.currentStep}…`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.status === "running" && <LogoLoader size={14} />}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  {live && (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="relative h-full overflow-hidden rounded-full transition-[width] duration-700"
                        style={{ width: `${pct}%` }}
                      >
                        <div className="absolute inset-0 bg-primary" />
                        <span className="progress-sheen" aria-hidden />
                      </div>
                    </div>
                  )}
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
