"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, GitPullRequest, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AgentApiError, getPrChecks, setPrChecks, type PrCheck, type PrCheckRepo } from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LivePill } from "../atoms";

/**
 * Olmene checks on every pull request (engine v2): per repository, compare the
 * PR's preview deployment with the live site and post a GitHub check. Paid
 * plans; needs the GitHub App's Checks: write and Deployments: read.
 */
export function PrChecksPanel({ repos, defaultSiteUrl }: { repos: string[]; defaultSiteUrl?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pr-checks"], queryFn: getPrChecks });
  const [planRequired, setPlanRequired] = useState(false);
  const settings = new Map((q.data?.repos ?? []).map((r) => [r.repo, r]));
  const checks = q.data?.checks ?? [];
  // Repos from the connection, plus any saved setting for a repo no longer listed.
  const all = [...new Set([...repos, ...settings.keys()])];

  async function save(repo: string, enabled: boolean, siteUrl?: string) {
    try {
      await setPrChecks(repo, enabled, siteUrl);
      await qc.invalidateQueries({ queryKey: ["pr-checks"] });
      toast.success(enabled ? `Olmene now checks every pull request in ${repo}.` : `PR checks are off for ${repo}.`);
      return true;
    } catch (e) {
      if (e instanceof AgentApiError && e.status === 402) setPlanRequired(true);
      else toast.error(e instanceof Error ? e.message : "Could not save the setting.");
      return false;
    }
  }

  return (
    <section className="grid gap-5 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="o-display flex items-center gap-2 text-2xl">
            <GitPullRequest className="size-5 text-muted-foreground" aria-hidden /> Checks on every pull request
          </h2>
          <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
            When a pull request has a preview deployment, Olmene runs its checks on the preview, compares them with your
            live site and posts the result on the pull request. It reads; it never writes to your code.
          </p>
        </div>
        <LivePill tone="neutral">Fix and Agency plans</LivePill>
      </div>

      {planRequired && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rim bg-artifact p-4 shadow-[inset_0_1px_0_var(--edge-top)]">
          <p className="text-[14px]">Pull request checks are part of the Fix and Agency plans.</p>
          <Button asChild variant="sheen" size="sm">
            <Link href="/pricing/">
              See plans <ArrowRight className="size-4 rtl-flip" aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      {all.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">Install the Olmene GitHub App on a repository to turn this on.</p>
      ) : (
        <ul className="grid gap-2">
          {all.map((repo) => (
            <RepoRow key={repo} repo={repo} setting={settings.get(repo)} defaultSiteUrl={defaultSiteUrl} onSave={save} />
          ))}
        </ul>
      )}

      {checks.length > 0 && <ChecksTable checks={checks} />}
    </section>
  );
}

function RepoRow({
  repo,
  setting,
  defaultSiteUrl,
  onSave,
}: {
  repo: string;
  setting?: PrCheckRepo;
  defaultSiteUrl?: string;
  onSave: (repo: string, enabled: boolean, siteUrl?: string) => Promise<boolean>;
}) {
  const on = !!setting?.enabled;
  const [siteUrl, setSiteUrl] = useState(setting?.site_url ?? defaultSiteUrl ?? "");
  const [busy, setBusy] = useState(false);
  const valid = /^https:\/\/[^\s/]+\.[^\s]+$/.test(siteUrl.trim());
  const id = `pr-site-${repo.replace(/[^a-z0-9]/gi, "-")}`;

  async function toggle(next: boolean) {
    if (next && !valid) return;
    setBusy(true);
    await onSave(repo, next, next ? siteUrl.trim() : undefined);
    setBusy(false);
  }

  return (
    <li className="o-well grid gap-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[13px]" dir="ltr">
          {repo}
        </p>
        <div className="flex items-center gap-2.5">
          <span className={cn("font-mono text-[11px]", on ? "text-tel-emerald" : "text-faint")}>{on ? "on" : "off"}</span>
          <Switch checked={on} disabled={busy || (!on && !valid)} onCheckedChange={toggle} aria-label={`Olmene checks on pull requests in ${repo}`} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-[12.5px] text-muted-foreground">
          Live site to compare with
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={id}
            type="url"
            inputMode="url"
            dir="ltr"
            placeholder="https://yoursite.com"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            className="h-9 min-w-0 flex-1 font-mono text-[13px]"
          />
          {on && setting && siteUrl.trim() !== setting.site_url && (
            <Button size="sm" variant="hairline" disabled={!valid || busy} onClick={() => toggle(true)}>
              Save
            </Button>
          )}
        </div>
        {!on && siteUrl && !valid && <p className="text-[12px] text-tel-amber">Use the full address, starting with https://</p>}
      </div>
      {setting?.last_error && (
        <p className="flex items-start gap-2 rounded-lg border border-tel-amber/40 bg-tel-amber/[0.06] px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-tel-amber" aria-hidden />
          <span>
            {setting.last_error.replace(/\.?\s*$/, ".")}
            {/permission|forbidden|403|checks|deployments/i.test(setting.last_error)
              ? " This needs a GitHub App permission on Olmene's side (Checks: write, Deployments: read), not on yours."
              : ""}
          </span>
        </p>
      )}
      {on && setting?.last_polled_at && <p className="text-[12px] text-faint">Last looked at {fmtDateTime(setting.last_polled_at)}</p>}
    </li>
  );
}

function ChecksTable({ checks }: { checks: PrCheck[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-edge">
      <p className="border-b border-edge px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Recent checks</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <tbody>
            {checks.slice(0, 12).map((c) => (
              <tr key={`${c.repo}-${c.head_sha}`} className="border-b border-edge last:border-0">
                <td className="px-4 py-2.5 font-mono text-[12px]" dir="ltr">
                  {c.repo} <span className="text-tel-sky">#{c.pr_number}</span>
                </td>
                <td className="px-4 py-2.5">
                  <LivePill tone={c.conclusion === "success" ? "ok" : c.conclusion === "failure" ? "problem" : "neutral"} pulse={false}>
                    {c.conclusion === "success" ? "passed" : c.conclusion === "failure" ? "regressed" : "neutral"}
                  </LivePill>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {c.regressions.length > 0
                    ? `${c.regressions.length} ${c.regressions.length === 1 ? "check got worse" : "checks got worse"}`
                    : c.improvements.length > 0
                      ? `${c.improvements.length} ${c.improvements.length === 1 ? "check improved" : "checks improved"}`
                      : "no change"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{fmtDateTime(c.created_at)}</td>
                <td className="px-4 py-2.5 text-end">
                  {c.check_run_url && (
                    <a href={c.check_run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-foreground hover:underline">
                      On GitHub <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
