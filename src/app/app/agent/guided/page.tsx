"use client";

/**
 * Guided fixes hub (engine v2): step-by-step fixes for platforms that don't
 * take pull requests. Arriving from a free scan (?scan=) creates the run
 * straight away and opens it; the page also lists past runs and hosts the
 * site-connections panel that powers "Olmene applies it for you".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentApiError, featureAgentEnabled, getGuidedRuns, startGuidedRun } from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { Flower } from "@/components/v2/flower";
import { Eyebrow, LivePill } from "@/components/v2/atoms";
import { StateMessage } from "@/components/v2/agent/job-view";
import { SiteConnectionsPanel } from "@/components/v2/agent/site-connections";

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function GuidedPage() {
  const [scanId, setScanId] = useState<string | null | undefined>(undefined);
  const [connectOpen, setConnectOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Same resume contract as the GitHub hub: the scan id survives sign-in via
  // sessionStorage, restored exactly once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get("scan");
    if (fromUrl) {
      sessionStorage.setItem("olmene.scanId", fromUrl);
      setScanId(fromUrl);
    } else {
      const saved = sessionStorage.getItem("olmene.scanId");
      if (saved) sessionStorage.removeItem("olmene.scanId");
      setScanId(saved);
    }
    if (sp.get("connect") === "1") setConnectOpen(true);
  }, []);

  const runs = useQuery({ queryKey: ["guided-runs"], queryFn: getGuidedRuns, enabled: featureAgentEnabled() });

  async function createFromScan(id: string) {
    setCreating(true);
    setCreateError(null);
    try {
      const { run } = await startGuidedRun({ scanId: id });
      window.location.href = `/app/agent/guided/${run.id}`;
    } catch (e) {
      setCreating(false);
      if (e instanceof AgentApiError && e.code === "rate_limited") {
        setCreateError("That's the three guided runs for today — they reset at midnight. A plan removes the limit.");
      } else if (e instanceof AgentApiError && e.code === "site_unreachable") {
        setCreateError("Olmene couldn't reach the site just now. Try again in a minute.");
      } else if (e instanceof AgentApiError && e.code === "nothing_to_fix") {
        setCreateError("Good news: this scan has nothing Olmene can fix step by step.");
      } else {
        setCreateError(e instanceof AgentApiError ? e.message : "Could not start the run. Try again.");
      }
    }
  }

  // Straight from a scan: create immediately, show the run, never the hub.
  useEffect(() => {
    if (scanId && !creating && !createError) void createFromScan(scanId);
  }, [scanId]);

  if (!featureAgentEnabled()) {
    return (
      <StateMessage
        title="Guided fixes aren't switched on yet"
        body="They're not enabled on this deployment. Your reports and free scans work as usual."
        action={
          <Button asChild variant="hairline">
            <Link href="/app/">Back to analyses</Link>
          </Button>
        }
      />
    );
  }

  if (scanId || creating) {
    return (
      <div className="grid justify-items-center gap-4 py-24 text-center">
        <Flower size={44} variant="breathe" />
        <p className="text-[15px] font-medium" role="status" aria-live="polite">
          Reading your scan and writing the step-by-step fixes…
        </p>
        <p className="max-w-md text-[13.5px] text-muted-foreground">
          This takes a few seconds. You&apos;ll get exact values to paste and the clicks for your platform.
        </p>
        {createError && (
          <div className="mt-2 grid max-w-md gap-3 rounded-2xl border border-signal-amber/40 bg-card p-5 text-start">
            <p className="text-[14px]">{createError}</p>
            <div className="flex gap-2">
              {scanId && (
                <Button variant="sheen" size="sm" onClick={() => void createFromScan(scanId)}>
                  Try again
                </Button>
              )}
              <Button asChild variant="hairline" size="sm">
                <Link href="/app/">Back</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const list = runs.data?.runs ?? [];

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header className="grid gap-2">
        <Eyebrow>Guided fixes</Eyebrow>
        <h1 className="o-display text-[32px] leading-tight">Step-by-step fixes for your platform</h1>
        <p className="max-w-xl text-[15px] text-muted-foreground">
          Exact values to paste and the clicks for your website builder — for sites that don&apos;t use GitHub.
          Olmene re-checks your live site and tells you when everything is in place.
        </p>
      </header>

      <SiteConnectionsPanel defaultOpen={connectOpen} />

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="o-display text-xl">Your guided runs</h2>
        </div>
        {runs.isLoading ? (
          <p className="px-5 py-6 text-[14px] text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-6 text-[14px] text-muted-foreground">
            No runs yet. Scan your site on the homepage and pick &ldquo;show me the fixes&rdquo; — the run opens here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead>
                <tr className="border-b font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                  <th className="px-5 py-2.5 text-start font-medium">Site</th>
                  <th className="px-5 py-2.5 text-start font-medium">Live</th>
                  <th className="px-5 py-2.5 text-start font-medium">Started</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12.5px]" dir="ltr">
                        {safeHost(r.site_url)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <LivePill tone={r.live_count === r.total_count && r.total_count > 0 ? "ok" : "neutral"} pulse={false}>
                        {r.live_count}/{r.total_count}
                      </LivePill>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                    <td className="px-5 py-3 text-end">
                      <Link href={`/app/agent/guided/${r.id}`} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
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

      <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
        <ListChecks className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Three guided runs a day on the free plan. Olmene re-checks your site daily for a month and emails you once
        every fix is live.
      </p>
    </div>
  );
}
