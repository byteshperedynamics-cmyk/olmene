/**
 * Olmene checks on every pull request (engine v2): for repositories the
 * customer turns this on for, each open PR's preview deployment (Vercel,
 * Netlify, Cloudflare Pages… as reported to GitHub) is compared with the
 * live site on the checks that decide how the page shows up in search and
 * link previews. A check that passes live but fails on the preview is a
 * regression: the PR gets a failing "Olmene" check run with the details.
 * Like ESLint for the marketing site. Deterministic, no AI.
 *
 * Needs the GitHub App's Checks: write and Deployments: read permissions
 * (owner settings); without them the repo shows the reason instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GithubPort, AgentJobRow } from "./runner";
import { runLiveCheck, type LiveCheckRun } from "./live-check";
import type { ScopedGithubClient } from "./github/client";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The checks compared between the live site and the preview. */
export const PR_CHECK_FIXERS = ["title-tag", "meta-description", "canonical-url", "json-ld-org", "social-meta", "viewport-meta", "lang-attribute", "h1-rewrite", "image-alt"];

export interface PrCheckOutcome {
  conclusion: "success" | "neutral" | "failure";
  title: string;
  summary: string;
  text: string;
  regressions: string[];
  improvements: string[];
}

/** Compare the live site and the preview check by check. */
export function comparePreview(live: LiveCheckRun, preview: LiveCheckRun, previewUrl: string): PrCheckOutcome {
  if (preview.fetchError) {
    return { conclusion: "neutral", title: "Preview couldn't be loaded", summary: `Olmene couldn't load ${previewUrl} (${preview.fetchError}).`, text: "", regressions: [], improvements: [] };
  }
  const liveBy = new Map(live.results.map((r) => [r.fixer, r]));
  const rows: string[] = ["| Check | Live site | This PR |", "|---|---|---|"];
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const r of preview.results) {
    const l = liveBy.get(r.fixer);
    const liveOk = live.fetchError ? null : l?.ok ?? null;
    if (liveOk === true && !r.ok) regressions.push(r.label);
    if (liveOk === false && r.ok) improvements.push(r.label);
    const mark = (ok: boolean | null) => (ok === null ? "–" : ok ? "✅" : "❌");
    rows.push(`| ${r.label} | ${mark(liveOk)} | ${mark(r.ok)} ${r.ok ? "" : r.detail.replace(/\|/g, "/").slice(0, 120)} |`);
  }
  const conclusion = regressions.length ? "failure" : "success";
  const title = regressions.length
    ? `${regressions.length} check${regressions.length === 1 ? "" : "s"} would break: ${regressions.slice(0, 2).join(", ")}`
    : improvements.length
      ? `No regressions, ${improvements.length} improvement${improvements.length === 1 ? "" : "s"}`
      : "No regressions";
  const summary = [
    `Olmene compared this PR's preview (${previewUrl}) with your live site on ${preview.results.length} search and link-preview checks.`,
    regressions.length ? `**Would break:** ${regressions.join(", ")}.` : "Nothing that works today breaks in this PR.",
    improvements.length ? `**Fixes:** ${improvements.join(", ")}.` : "",
  ].filter(Boolean).join("\n\n");
  return { conclusion, title, summary, text: rows.join("\n"), regressions, improvements };
}

function publicPreviewUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function previewUrlFor(client: ScopedGithubClient, sha: string): Promise<string | null> {
  const deployments = (await client.listDeployments(sha)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  for (const d of deployments) {
    const statuses = await client.listDeploymentStatuses(d.id);
    const ok = statuses.find((st) => st.state === "success" && publicPreviewUrl(st.environment_url ?? st.target_url));
    if (ok) return publicPreviewUrl(ok.environment_url ?? ok.target_url);
  }
  return null;
}

interface RepoSetting {
  id: string;
  user_id: string;
  connection_id: string;
  repo: string;
  site_url: string;
}

/** Cron: up to 5 repos × 5 open PRs per run; each head commit is checked once. */
export async function syncPrChecks(db: SupabaseClient, gh: GithubPort, fetchFn: FetchLike, now = new Date()): Promise<{ repos: number; posted: number }> {
  const { data } = await db.from("pr_check_repos").select("id, user_id, connection_id, repo, site_url").eq("enabled", true)
    .order("last_polled_at", { ascending: true, nullsFirst: true }).limit(5);
  let posted = 0;
  const repos = (data ?? []) as RepoSetting[];
  for (const r of repos) {
    await db.from("pr_check_repos").update({ last_polled_at: now.toISOString() }).eq("id", r.id);
    let client: ScopedGithubClient;
    try {
      client = await gh.client({ id: r.id, user_id: r.user_id, connection_id: r.connection_id, input: { targetRepo: r.repo } } as unknown as AgentJobRow);
    } catch (e) {
      await db.from("pr_check_repos").update({ last_error: (e as Error).message.slice(0, 200) }).eq("id", r.id);
      continue;
    }
    let pulls;
    try {
      pulls = (await client.listOpenPulls(5)).slice(0, 5);
    } catch (e) {
      await db.from("pr_check_repos").update({ last_error: `Couldn't list pull requests: ${(e as Error).message.slice(0, 160)}` }).eq("id", r.id);
      continue;
    }
    let live: LiveCheckRun | null = null;
    for (const pr of pulls) {
      const { data: seen } = await db.from("pr_checks").select("id").eq("repo", r.repo).eq("head_sha", pr.head.sha).maybeSingle();
      if (seen) continue;
      let url: string | null;
      try {
        url = await previewUrlFor(client, pr.head.sha);
      } catch (e) {
        const status = (e as { status?: number }).status;
        await db.from("pr_check_repos").update({ last_error: status === 403 || status === 404 ? "The Olmene GitHub app needs the Deployments: read permission." : "Deployments could not be read." }).eq("id", r.id);
        break;
      }
      if (!url) continue; // preview not ready yet: next run
      const fixes = PR_CHECK_FIXERS.map((fixer_id) => ({ fixer_id, preview: null }));
      live ??= await runLiveCheck(r.site_url, fixes, fetchFn, now);
      const preview = await runLiveCheck(url, fixes, fetchFn, now);
      const outcome = comparePreview(live, preview, url);
      try {
        const run = await client.createCheckRun({ name: "Olmene", head_sha: pr.head.sha, status: "completed", conclusion: outcome.conclusion, details_url: url, output: { title: outcome.title, summary: outcome.summary, text: outcome.text } });
        await db.from("pr_checks").insert({ user_id: r.user_id, repo: r.repo, pr_number: pr.number, head_sha: pr.head.sha, preview_url: url, conclusion: outcome.conclusion, regressions: outcome.regressions, improvements: outcome.improvements, check_run_url: run.html_url ?? null });
        await db.from("pr_check_repos").update({ last_error: null }).eq("id", r.id);
        posted++;
      } catch (e) {
        const status = (e as { status?: number }).status;
        await db.from("pr_check_repos").update({ last_error: status === 403 ? "The Olmene GitHub app needs the Checks: write permission." : `Couldn't post the check: ${(e as Error).message.slice(0, 160)}` }).eq("id", r.id);
        break;
      }
    }
  }
  return { repos: repos.length, posted };
}
