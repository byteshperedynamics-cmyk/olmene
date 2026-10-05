"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AgentApiError,
  advanceAgentJob,
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
 */
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
  const awaiting = data?.job.status === "awaiting_approval";
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    const tick = async () => {
      if (!alive) return;
      const st = statusRef.current;
      // The job usually loads AFTER the first tick (300 ms); without a status
      // yet, wait for it instead of ending the loop (runs stayed "Queued").
      if (!st) {
        if (alive) timer = setTimeout(tick, 500);
        return;
      }
      if (st === "awaiting_approval" || !ACTIVE_JOB_STATUSES.includes(st)) return;
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
  }, [id, refetch, awaiting]);

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
      if (e instanceof AgentApiError && (e.code === "plan_required" || e.code === "quota_exceeded")) {
        toast.error(e.message, {
          description: "Planning and previews stay free. Upgrade to ship fixes.",
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
    <JobView
      state={data}
      checked={checked}
      onToggle={toggle}
      busy={busy}
      onApprove={onApprove}
      onReject={onReject}
      onCancel={onCancel}
    />
  );
}
