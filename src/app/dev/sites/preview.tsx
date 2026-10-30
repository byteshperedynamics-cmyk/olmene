"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import SitesPage from "@/app/app/sites/page";
import OverviewPage from "@/app/app/page";
import { AppShell } from "@/components/app-header";
import { AsyncState, EmptyState, type QueryLike } from "@/components/app/async-state";
import { DataError } from "@/lib/data";
import { AiVisibilityPanel } from "@/components/v2/sites/ai-visibility-panel";
import { PrChecksPanel } from "@/components/v2/agent/pr-checks-panel";
import { cn } from "@/lib/utils";

const day = (n: number) => new Date(Date.UTC(2026, 9, 13) - n * 86_400_000).toISOString();

/** Example data only (acme-analytics.com), seeded into the query cache. */
function seed(qc: ReturnType<typeof useQueryClient>, empty: boolean) {
  for (const k of ["sites", "notifications", "agent-jobs", "guided-runs", "ai-visibility", "pr-checks"]) qc.setQueryDefaults([k], { staleTime: Infinity, retry: false });
  qc.setQueryData(["sites"], empty ? [] : [
    { id: "site-1", url: "https://acme-analytics.com", host: "acme-analytics.com", monitor: true, last_scan_at: day(2), last_score: 82, next_scan_at: day(-5), created_at: day(30), ai_last: { mentionShare: 0.5, citeShare: 0.33, checkedAt: day(3) } },
    { id: "site-2", url: "https://shop.acme.example", host: "shop.acme.example", monitor: true, last_scan_at: null, last_score: 47, next_scan_at: day(-6), created_at: day(1), ai_last: null },
  ]);
  qc.setQueryData(["notifications"], empty ? [] : [
    { id: 5, kind: "site_regression", payload: { site: "acme-analytics.com", regressed: [{ check: "Meta description", after: "missing" }] }, status: "sent", created_at: day(2) },
    { id: 4, kind: "fixes_live", payload: { site: "acme-analytics.com", passed: 3, total: 3, jobId: "j1" }, status: "sent", created_at: day(6) },
    { id: 3, kind: "pr_opened", payload: { prNumber: 14, repo: "acme/site", jobId: "j1" }, status: "sent", created_at: day(8) },
    { id: 2, kind: "ai_visibility_change", payload: { site: "acme-analytics.com", siteId: "site-1" }, status: "sent", created_at: day(10) },
    { id: 1, kind: "report_ready", payload: { site: "acme-analytics.com", score: 61, jobId: "r1" }, status: "sent", created_at: day(12) },
  ]);
  qc.setQueryData(["agent-jobs"], { jobs: empty ? [] : [
    { id: "j2", status: "awaiting_approval", current_step: null, input: { targetRepo: "acme/site" }, step_outputs: {}, error: null, report_id: null, created_at: day(0), completed_at: null },
    { id: "j1", status: "completed", current_step: null, input: { targetRepo: "acme/site" }, step_outputs: {}, error: null, report_id: null, created_at: day(8), completed_at: day(8), pr_number: 14, pr_state: "open" },
    { id: "j0", status: "completed", current_step: null, input: { targetRepo: "acme/site" }, step_outputs: { liveCheck: { last: { checkedAt: day(9), siteUrl: "https://acme-analytics.com", results: [], passed: 3, total: 3, regressed: [] }, settled: true } }, error: null, report_id: null, created_at: day(12), completed_at: day(11), pr_number: 11, pr_state: "merged" },
    { id: "j3", status: "completed", current_step: null, input: { targetRepo: "acme/docs" }, step_outputs: {}, error: null, report_id: null, created_at: day(1), completed_at: day(1), pr_number: 16, pr_state: "merged" },
    { id: "j4", status: "completed", current_step: null, input: { targetRepo: "acme/blog" }, step_outputs: { liveCheck: { last: { checkedAt: day(20), siteUrl: "https://blog.acme.example", results: [], passed: 1, total: 2, regressed: [] }, settled: true } }, error: null, report_id: null, created_at: day(22), completed_at: day(21), pr_number: 9, pr_state: "merged" },
  ] });
  qc.setQueryData(["guided-runs"], { runs: empty ? [] : [{ id: "g1", site_url: "https://shop.acme.example", platform: { id: "shopify", label: "Shopify" }, live_count: 2, total_count: 5, last_checked_at: day(1), created_at: day(1), scan_id: null, report_id: null }] });
  const results = [
    { question: "What is the best product analytics tool for a small SaaS?", mentioned: true, cited: true, rank: 2, competitors: ["Mixpanel", "PostHog"], sources: ["https://acme-analytics.com/pricing", "https://example.org/review"], excerpt: "For small SaaS teams, PostHog and Acme Analytics are the usual picks: Acme is simpler to set up…" },
    { question: "Mixpanel alternatives for startups", mentioned: true, cited: false, rank: 4, competitors: ["PostHog", "Amplitude", "Heap"], sources: [], excerpt: "Popular alternatives include PostHog, Amplitude, Heap and Acme Analytics." },
    { question: "Which analytics tool works without cookies?", mentioned: false, cited: false, rank: null, competitors: ["Plausible", "Fathom"], sources: ["https://example.org/privacy-analytics"], excerpt: null },
  ];
  qc.setQueryData(["ai-visibility", "site-1"], {
    site: { id: "site-1", host: "acme-analytics.com", questions: results.map((r) => r.question), nextCheckAt: day(-4), competitors: [] },
    runs: empty ? [] : [0, 1, 2, 3, 4, 5].map((w) => ({ id: 10 - w, engine: "gemini-search", mention_share: [0.5, 0.33, 0.33, 0.17, 0.17, 0][w], cite_share: [0.33, 0.17, 0.17, 0.17, 0, 0][w], competitor_mentions: { PostHog: 3, Mixpanel: 1, Plausible: 1 }, results, checked_at: day(3 + w * 7) })),
  });
  qc.setQueryData(["pr-checks"], { repos: empty ? [] : [{ id: "p1", repo: "acme/site", site_url: "https://acme-analytics.com", enabled: true, last_error: null, last_polled_at: day(0), created_at: day(5) }, { id: "p2", repo: "acme/docs", site_url: "https://docs.acme.example", enabled: true, last_error: "GitHub refused the check run (403): Resource not accessible by integration", last_polled_at: day(0), created_at: day(5) }], checks: empty ? [] : [
    { repo: "acme/site", pr_number: 21, head_sha: "a1", preview_url: null, conclusion: "failure", regressions: ["Meta description"], improvements: [], check_run_url: "https://github.com/", created_at: day(0) },
    { repo: "acme/site", pr_number: 19, head_sha: "b2", preview_url: null, conclusion: "success", regressions: [], improvements: ["Image alt text"], check_run_url: "https://github.com/", created_at: day(2) },
  ] });
}

export function SitesPreview() {
  const qc = useQueryClient();
  const [view, setView] = useState<"workspace" | "overview" | "ai" | "pr" | "empty" | "states">("workspace");
  const [ready, setReady] = useState(() => (seed(qc, false), true));
  const pick = (v: typeof view) => {
    seed(qc, v === "empty");
    setView(v);
    setReady(true);
  };
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["workspace", "overview", "ai", "pr", "empty", "states"] as const).map((v) => (
            <button key={v} type="button" onClick={() => pick(v)} className={cn("rounded-full border px-3 py-1 font-mono text-[11px]", view === v ? "border-foreground text-foreground" : "border-rim text-muted-foreground")}>
              {v}
            </button>
          ))}
        </div>
        <ThemeToggle />
      </div>
      {ready && view === "workspace" && (
        <div className="overflow-hidden rounded-xl border">
          <AppShell pathname="/app/" identity={null} onSignOut={() => {}}>
            <OverviewPage />
          </AppShell>
        </div>
      )}
      {ready && view === "states" && <StatesPreview />}
      {ready && view === "overview" && <SitesPage />}
      {ready && view === "empty" && (
        <>
          <SitesPage />
          <AiVisibilityPanel siteId="site-1" />
        </>
      )}
      {ready && view === "ai" && <AiVisibilityPanel siteId="site-1" />}
      {ready && view === "pr" && <PrChecksPanel repos={["acme/site", "acme/docs", "acme/blog"]} defaultSiteUrl="https://acme-analytics.com" />}
    </div>
  );
}

/** Every async state of a list, side by side (refinement 2026-10-30). */
function StatesPreview() {
  const base: QueryLike<string[]> = { data: undefined, error: null, isError: false, isPending: false, isFetching: false, dataUpdatedAt: 0, refetch: () => {} };
  const states: Array<[string, QueryLike<string[]>]> = [
    ["loading", { ...base, isPending: true }],
    ["failed", { ...base, isError: true, error: new DataError({ message: "canceling statement due to statement timeout", code: "57014" }) }],
    ["denied", { ...base, isError: true, error: new DataError({ message: "permission denied for table sites", code: "42501" }) }],
    ["stale", { ...base, isError: true, error: new Error("Failed to fetch"), data: ["acme-analytics.com", "shop.acme.example"], dataUpdatedAt: Date.UTC(2026, 9, 30, 9, 41) }],
    ["empty", { ...base, data: [] }],
    ["ready", { ...base, data: ["acme-analytics.com", "shop.acme.example"] }],
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {states.map(([name, q]) => (
        <section key={name} className="grid gap-2">
          <p className="font-mono text-[12px] text-faint">{name}</p>
          <AsyncState query={q} what="sites" isEmpty={(d) => d.length === 0} empty={<EmptyState title="No sites yet" body="A site appears here when its first full analysis completes." />}>
            {(d) => (
              <ul className="grid gap-1 rounded-xl border bg-card p-3 text-[14px]">
                {d.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </AsyncState>
        </section>
      ))}
    </div>
  );
}
