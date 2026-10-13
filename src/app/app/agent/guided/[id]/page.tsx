"use client";

/**
 * One guided run (engine v2). The customer does the clicks — or, on a
 * connected Webflow/WordPress site, approves and Olmene applies. Review must
 * feel like control: current vs new values side by side, exact steps, and a
 * live check that proves each fix landed. Applying on the platform needs a
 * paid plan (402 → inline plan card); reverting never does.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, Download, RefreshCw, TriangleAlert, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentApiError,
  applyGuidedAuto,
  featureAgentEnabled,
  getGuidedRun,
  planGuidedAuto,
  revertGuidedAuto,
  verifyGuidedRun,
  type GuidedFix,
  type GuidedRun,
  type GuidedValue,
} from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flower } from "@/components/v2/flower";
import { Eyebrow, LivePill } from "@/components/v2/atoms";

function FixStatusPill({ fix }: { fix: GuidedFix }) {
  if (fix.status === "live") return <LivePill tone="ok" pulse={false}>live</LivePill>;
  if (fix.status === "blocked") return <LivePill tone="neutral" pulse={false}>not possible here</LivePill>;
  if (fix.status === "not_live") return <LivePill tone="problem" pulse={false}>not live yet</LivePill>;
  return <LivePill tone="neutral" pulse={false}>to do</LivePill>;
}

function GuidedValueRow({ v }: { v: GuidedValue }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.value);
      setCopied(true);
      toast.success("Copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — your browser blocked clipboard access.");
    }
  };
  const download = () => {
    const blob = new Blob([v.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = v.filename ?? "olmene-fix.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border bg-background p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium">{v.label}</p>
        {v.kind === "file" ? (
          <Button variant="hairline" size="sm" onClick={download}>
            <Download className="size-3.5" aria-hidden /> {v.filename ?? "Download"}
          </Button>
        ) : (
          <Button variant="hairline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      {v.current && (
        <p className="mt-2 break-words text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="me-1.5 inline-block rounded bg-surface-2 px-1 font-mono text-[10px] uppercase tracking-wide">current</span>
          <span className="line-through decoration-muted-foreground/50">{v.current}</span>
        </p>
      )}
      {v.kind === "code" ? (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg border bg-surface-2/60 px-3 py-2 font-mono text-[11.5px] leading-relaxed" dir="ltr">
          <code>{v.value}</code>
        </pre>
      ) : (
        <p className="mt-1 break-words text-[13.5px] font-medium leading-relaxed">{v.value}</p>
      )}
    </div>
  );
}

function GuidedFixCard({ fix }: { fix: GuidedFix }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-card", fix.status === "live" && "border-primary/35")}>
      <div className="grid gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <FixStatusPill fix={fix} />
          <h3 className="text-[15px] font-medium">{fix.title}</h3>
        </div>
        <p className="text-[13.5px] text-muted-foreground">{fix.why}</p>

        {fix.auto && (
          <AutoStrip fix={fix} />
        )}

        {fix.blocked ? (
          <p className="flex items-start gap-2 rounded-lg border border-signal-amber/40 bg-signal-amber/[0.06] px-3 py-2 text-[13px]">
            <Ban className="mt-0.5 size-3.5 shrink-0 text-signal-amber" aria-hidden />
            {fix.blocked}
          </p>
        ) : (
          <>
            {fix.values.length > 0 && <div className="grid gap-2">{fix.values.map((v) => <GuidedValueRow key={v.label + v.kind} v={v} />)}</div>}
            <ol className="list-decimal space-y-1 ps-5 text-[13.5px] leading-relaxed">
              {fix.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </>
        )}

        {fix.checkDetail && fix.status !== "live" && (
          <p className="text-[12px] text-muted-foreground">Last check: {fix.checkDetail}</p>
        )}
      </div>
    </div>
  );
}

/** The connected-platform strip: what Olmene would change, what happened. */
function AutoStrip({ fix }: { fix: GuidedFix }) {
  const auto = fix.auto!;
  const chg = auto.changes.map((c) => c.label).join(", ");
  if (auto.revertedAt) {
    return (
      <p className="rounded-lg border bg-background px-3 py-2 text-[12.5px] text-muted-foreground">
        Olmene put the previous {chg} back on {auto.channel} at {fmtDateTime(auto.revertedAt)}.
      </p>
    );
  }
  if (auto.applied) {
    return auto.applied.ok ? (
      <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-leaf-soft px-3 py-2 text-[12.5px]">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Olmene applied {chg} on {auto.channel} at {fmtDateTime(auto.applied.at)}
          {auto.applied.published ? " and published" : ""}.
        </span>
      </p>
    ) : (
      <p className="flex items-start gap-2 rounded-lg border border-signal-rust/40 bg-diff-del px-3 py-2 text-[12.5px]">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-signal-rust" aria-hidden />
        <span>Applying on {auto.channel} failed: {auto.applied.error ?? "unknown error"}. The change is saved — retry from the button above.</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-leaf-soft px-3 py-2 text-[12.5px]">
      <Flower size={14} variant="static" className="mt-0.5 shrink-0" />
      <span>
        Your {auto.channel} connection lets Olmene apply this for you: {chg}. Use &ldquo;Apply on {auto.channel}&rdquo; below —
        nothing is written until you do.
      </span>
    </p>
  );
}

export default function GuidedRunPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [busy, setBusy] = useState<string | null>(null);
  const [planRequired, setPlanRequired] = useState(false);

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ["guided-run", id],
    queryFn: () => getGuidedRun(id),
    enabled: !!id && featureAgentEnabled(),
    retry: 1,
    refetchInterval: (q) => {
      // While an apply/verify is in flight the server may still be writing.
      return busy ? 2500 : false;
    },
  });

  const run: GuidedRun | undefined = data?.run;
  const applyable = (run?.fixes ?? []).filter((f) => f.auto && !f.auto.applied && !f.auto.revertedAt && f.status !== "live" && !f.blocked);
  const appliedNotLive = (run?.fixes ?? []).filter((f) => f.auto?.applied?.ok && f.status !== "live");
  const live = run?.live_count ?? 0;
  const total = run?.total_count ?? 0;
  const channel = applyable[0]?.auto?.channel ?? appliedNotLive[0]?.auto?.channel ?? null;

  useEffect(() => {
    if (run && !applyable.length && !appliedNotLive.length) setPlanRequired(false);
  }, [run?.id, applyable.length, appliedNotLive.length]);

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  async function onAuto() {
    setBusy("auto");
    try {
      await planGuidedAuto(id);
      await refetch();
      toast.success("Checked which fixes Olmene can apply for you.");
    } catch (e) {
      if (e instanceof AgentApiError && e.code === "not_connected") {
        toast.error("Connect your site first — the connect form is on the guided fixes page.", {
          action: { label: "Open", onClick: () => (window.location.href = "/app/agent/guided/?connect=1") },
        });
      } else if (e instanceof AgentApiError && e.code === "no_channel") {
        toast.error(e.message);
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not plan the auto-apply. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onApply() {
    setBusy("apply");
    try {
      await applyGuidedAuto(id, applyable.map((f) => f.id));
      toast.success("Applied. The live check confirms it in a moment.");
      await refetch();
    } catch (e) {
      if (e instanceof AgentApiError && e.code === "plan_required") {
        setPlanRequired(true);
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not apply. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onRevert(fixIds: string[]) {
    setBusy("revert");
    try {
      await revertGuidedAuto(id, fixIds);
      toast("Reverted — the previous values are back on your site.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not revert. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onVerify() {
    await act("verify", () => verifyGuidedRun(id));
    toast.success("Checked your live site.");
  }

  if (!featureAgentEnabled()) {
    return (
      <div className="grid justify-items-center gap-3 py-24 text-center">
        <p className="o-display text-2xl">Guided fixes aren&apos;t switched on yet</p>
        <Button asChild variant="hairline">
          <Link href="/app/">Back to analyses</Link>
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid justify-items-center gap-3 py-24 text-center">
        <p className="o-display text-2xl">Could not load this run</p>
        <p className="text-[14px] text-muted-foreground">{loadError instanceof AgentApiError ? loadError.message : "Check your connection and try again."}</p>
        <Button variant="hairline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading || !run) {
    return (
      <div className="grid place-items-center py-28">
        <Flower size={44} variant="breathe" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="grid gap-3">
        <Link
          href="/app/agent/guided/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 rtl-flip" aria-hidden /> Guided fixes
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <Eyebrow>{run.platform.label}</Eyebrow>
            <h1 className="o-display font-mono text-[26px] leading-tight" dir="ltr">
              {(() => {
                try {
                  return new URL(run.site_url).hostname;
                } catch {
                  return run.site_url;
                }
              })()}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Started {fmtDateTime(run.created_at)}
              {run.last_checked_at ? ` · last checked ${fmtDateTime(run.last_checked_at)}` : ""}
            </p>
          </div>
          <LivePill tone={live === total && total > 0 ? "ok" : "neutral"} pulse={live > 0 && live < total}>
            {total > 0 ? `${live} of ${total} live` : "checking"}
          </LivePill>
        </div>
        {run.platform.notes && <p className="rounded-xl border border-line-strong bg-surface-2/40 px-3.5 py-2.5 text-[13px] text-muted-foreground">{run.platform.notes}</p>}
      </header>

      {planRequired && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/35 bg-leaf-soft p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Applying fixes on {channel ?? "your platform"} needs a plan</p>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">
              Planning, doing it yourself and reverting stay free. A plan lets Olmene write to your site for you.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="sheen">
              <Link href="/pricing/">
                See plans <ArrowRight className="size-4 rtl-flip" aria-hidden />
              </Link>
            </Button>
            <Button variant="hairline" onClick={() => setPlanRequired(false)}>
              Back to the steps
            </Button>
          </div>
        </div>
      )}

      {live === total && total > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/35 bg-leaf-soft p-5">
          <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-[14px]">
            Every fix is live on your site. Olmene re-checks daily for a month and tells you if one stops working.
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {run.fixes.map((f) => (
          <div key={f.id} className="relative">
            <GuidedFixCard fix={f} />
            {f.auto?.applied?.ok && !f.auto.revertedAt && f.status !== "live" && (
              <Button
                variant="hairline"
                size="sm"
                className="mt-2"
                disabled={busy !== null}
                onClick={() => void onRevert([f.id])}
              >
                {busy === "revert" ? "Reverting…" : (
                  <>
                    <Undo2 className="size-3.5" aria-hidden /> Undo this change
                  </>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-card/95 px-4 py-3 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.5)] backdrop-blur sm:px-5">
        <p className="min-w-0 text-[12.5px] text-muted-foreground">
          {live}/{total} confirmed live
          {appliedNotLive.length > 0 ? ` · ${appliedNotLive.length} applied, waiting for your deploy` : ""}
          {" · nothing was written unless it says applied"}
        </p>
        <div className="flex flex-wrap gap-2">
          {applyable.length > 0 && channel && (
            <>
              <Button variant="hairline" onClick={onAuto} disabled={busy !== null}>
                {busy === "auto" ? "Checking…" : "What can Olmene apply?"}
              </Button>
              <Button variant="sheen" onClick={onApply} disabled={busy !== null}>
                {busy === "apply" ? "Applying…" : `Apply on ${channel}`}
              </Button>
            </>
          )}
          <Button variant="hairline" onClick={onVerify} disabled={busy !== null}>
            {busy === "verify" ? (
              "Checking…"
            ) : (
              <>
                <RefreshCw className="size-3.5" aria-hidden /> I&apos;ve made the changes — check now
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="flex items-start gap-2 pb-6 text-[12px] text-muted-foreground">
        <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
        The live check reads your public site only — it never needs your logins. Checks run after you apply, after
        you say you&apos;re done, and then daily for 30 days.
      </p>
    </div>
  );
}
