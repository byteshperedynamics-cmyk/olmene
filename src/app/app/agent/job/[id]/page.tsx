"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentApiError,
  approveAgentJob,
  cancelAgentJob,
  featureAgentEnabled,
  getAgentJob,
  rejectAgentJob,
} from "@/lib/agent-client";
import { Flower } from "@/components/v2/flower";
import { ACTIVE_JOB_STATUSES } from "@/components/v2/agent/fixers";
import { JobView, StateMessage } from "@/components/v2/agent/job-view";

/**
 * Agent run (brief §5B). Review must feel like control, not risk: the diff is
 * centre stage, every change carries its impact, evidence and undo steps, and
 * the approve action has one confident home in a sticky bar.
 *
 * Runs advance on the server (cron every 20 s, plus a kick after create and
 * approve), so this page only polls — closing the tab loses nothing.
 */
export default function AgentJobPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  // Set when approve returns 402 plan_required: the inline upgrade card
  // replaces the run's approve bar until the user picks a plan.
  const [planRequired, setPlanRequired] = useState(false);

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
      toast.success(`Approved ${res.approved} ${res.approved === 1 ? "change" : "changes"}. Opening the pull request.`);
      await refetch();
    } catch (e) {
      if (e instanceof AgentApiError && e.code === "plan_required") {
        setPlanRequired(true);
      } else if (e instanceof AgentApiError && e.code === "quota_exceeded") {
        toast.error(e.message, {
          description: "Planning and previews stay free. Upgrade for more fixes.",
          duration: 10000,
          action: { label: "See plans", onClick: () => (window.location.href = "/pricing/") },
        });
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not approve. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onReject() {
    setBusy("reject");
    try {
      await rejectAgentJob(id);
      toast("Declined. Nothing was written to your repository.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not decline. Try again.");
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
      toast.error(e instanceof AgentApiError ? e.message : "Could not cancel. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!featureAgentEnabled()) {
    return (
      <StateMessage
        title="The fix agent isn't switched on yet"
        body="Fix runs are not enabled on this deployment. Your reports and free scans work as usual."
      />
    );
  }

  if (loadError) {
    return (
      <StateMessage
        title="Could not load this fix run"
        body={loadError instanceof AgentApiError ? loadError.message : "Check your connection and try again."}
        action={
          <Button variant="hairline" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid place-items-center py-28">
        <Flower size={44} variant="breathe" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      {planRequired && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rim bg-artifact p-5 shadow-[inset_0_1px_0_var(--edge-top)] sm:p-6">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Applying fixes needs a plan</p>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">
              Planning and previews stay free — you saw the exact diff without paying. Pick a plan to open the pull
              request; your selected changes are kept.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="sheen">
              <Link href="/pricing/">
                See plans <ArrowRight className="size-4 rtl-flip" aria-hidden />
              </Link>
            </Button>
            <Button variant="hairline" onClick={() => setPlanRequired(false)}>
              Back to the diff
            </Button>
          </div>
        </div>
      )}
      <JobView
        state={data}
        checked={checked}
        onToggle={toggle}
        busy={busy}
        onApprove={onApprove}
        onReject={onReject}
        onCancel={onCancel}
      />
    </div>
  );
}
