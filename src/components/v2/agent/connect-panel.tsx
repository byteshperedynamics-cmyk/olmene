"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { featureMeasureEnabled } from "@/lib/agent-client";
import { Eyebrow } from "../atoms";
import { ConnectDiagram } from "../data-viz";
import { Flower } from "../flower";

/**
 * Connect flow (brief §5D): what is connected, in a diagram, and permissions
 * phrased as what the user will see happen, including what Olmene can never
 * do. Search Console joins as a third source once Measure ships.
 */
export function ConnectPanel({
  hasScan,
  canAnalyze = true,
  githubConfigured,
  canRegister = false,
  githubConnected,
  killSwitch,
  busy,
  onRegister,
  onConnect,
  installUrl = null,
}: {
  hasScan: boolean;
  /** False when the account has no plan or report credit (the analysis form would refuse). */
  canAnalyze?: boolean;
  githubConfigured: boolean;
  /** Owner-only one-time app registration (the server decides). */
  canRegister?: boolean;
  githubConnected: boolean;
  killSwitch: boolean;
  busy: string | null;
  onRegister: () => void;
  onConnect: () => void;
  /** Set when GitHub reported no installation: the app's install page. */
  installUrl?: string | null;
}) {
  const step = !hasScan ? 1 : 2;
  const measure = featureMeasureEnabled();
  const siteNode = { key: "site", label: "Your site", status: hasScan ? "scanned" : "scan first", state: hasScan ? ("connected" as const) : ("pending" as const) };
  const ghNode = {
    key: "gh",
    label: "GitHub",
    status: githubConnected ? "connected" : "pending",
    state: githubConnected ? ("connected" as const) : ("pending" as const),
  };
  return (
    <section className="grid items-center gap-8 overflow-hidden rounded-2xl border bg-card p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="mx-auto w-full max-w-sm">
        <ConnectDiagram
          ariaLabel={`Your site ${hasScan ? "scanned" : "not scanned yet"}, GitHub ${githubConnected ? "connected" : "not connected"}`}
          nodes={
            measure
              ? [siteNode, ghNode, { key: "gsc", label: "Search Console", status: "optional", state: "off" }]
              : [siteNode, ghNode]
          }
          center={<Flower size={44} variant={githubConnected ? "static" : "breathe"} />}
        />
      </div>

      <div className="grid min-w-0 gap-5">
        <Eyebrow>Step {step} of 2</Eyebrow>
        {step === 1 ? (
          <>
            <h2 className="o-display text-[28px] leading-tight">Start with a scan of your site</h2>
            <p className="text-[15px] text-muted-foreground">
              Olmene plans fixes from a completed analysis of your site. Run one first; it takes a few minutes.
              {!canAnalyze && " Analyses are part of every paid plan, or available as a single report."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="sheen" size="xl">
                <Link href={canAnalyze ? "/app/new/" : "/app/billing/"}>{canAnalyze ? "Analyze my site" : "Choose a plan"}</Link>
              </Button>
              {!canAnalyze && (
                <Button asChild variant="hairline" size="xl">
                  <Link href="/">Free scan first</Link>
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="o-display text-[28px] leading-tight">Connect GitHub to ship fixes</h2>
            <p className="text-[15px] text-muted-foreground">
              Olmene finds the problem and prepares the fix. Your team decides what gets merged.
            </p>
            <ul className="grid gap-2 text-[14px]">
              {[
                "Reads and edits one repository you choose",
                "Opens pull requests. You merge them.",
                "Every change is logged and can be undone",
              ].map((s) => (
                <li key={s} className="flex items-start gap-3 rounded-xl border bg-background/40 px-3.5 py-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-tel-emerald" strokeWidth={2.5} aria-hidden />
                  {s}
                </li>
              ))}
              <li className="flex items-start gap-3 rounded-xl border bg-background/40 px-3.5 py-2.5">
                <X className="mt-0.5 size-4 shrink-0 text-signal-rust" strokeWidth={2.5} aria-hidden />
                Never pushes to your main branch, deletes branches, or sees other repositories
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {!githubConfigured && !canRegister ? (
                <p className="rounded-xl border border-dashed px-4 py-3 text-[14px] text-muted-foreground">
                  GitHub connections are opening shortly. Your scan and report are ready in the meantime.
                </p>
              ) : !githubConfigured ? (
                <Button variant="sheen" size="xl" onClick={onRegister} disabled={busy !== null || killSwitch}>
                  {busy === "register" ? "Opening GitHub…" : "Set up the GitHub app"}
                </Button>
              ) : installUrl ? (
                <>
                  <Button asChild variant="sheen" size="xl">
                    <a href={installUrl}>Install on GitHub</a>
                  </Button>
                  <Button variant="hairline" size="xl" onClick={onConnect} disabled={busy !== null || killSwitch}>
                    {busy === "connect" ? "Opening GitHub…" : "Installed? Connect"}
                  </Button>
                </>
              ) : (
                <Button variant="sheen" size="xl" onClick={onConnect} disabled={busy !== null || killSwitch}>
                  {busy === "connect" ? "Opening GitHub…" : "Connect GitHub"}
                </Button>
              )}
              <Link href="/security/#github" target="_blank" className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                Review GitHub permissions & security →
              </Link>
              {(githubConfigured || canRegister) && (
                <p className="text-[12.5px] text-muted-foreground">
                {installUrl
                  ? "Install Olmene on your site's repository on GitHub, then come back and connect."
                  : githubConfigured
                    ? "GitHub asks you to pick the repository in the same step."
                    : "One-time setup. GitHub shows the exact permissions first."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
