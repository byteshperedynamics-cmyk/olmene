import { describe, expect, test } from "bun:test";
import { liveCheckDue, nextLiveCheckState, runLiveCheck, type AppliedFix, type LiveCheckRun } from "../live-check";
import { syncLiveChecks, type LiveCheckDbPort } from "../sync";
import type { AgentJobRow } from "../runner";

const SITE = "https://acme.example/";

function page(html: string, extra: Record<string, number> = {}) {
  return async (input: string) => {
    const url = String(input);
    if (url === SITE || url === "https://acme.example") {
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
    const path = new URL(url).pathname;
    return new Response("ok", { status: extra[path] ?? 404 });
  };
}

const LIVE_HTML = `<!doctype html><html><head>
<title>Acme</title>
<meta name="description" content="Acme helps small teams ship analytics in a day, with a free tier and plain pricing.">
<link rel="canonical" href="https://acme.example/">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"}]}</script>
</head><body><h1 class="hero">Product analytics for small teams</h1><a href="/pricing">Pricing</a><img src="a.png" alt="Dashboard"></body></html>`;

const fix = (fixer_id: string, diff = ""): AppliedFix => ({ fixer_id, preview: { edits: [{ path: "index.html", diff }] } });

describe("live check — per-fix checks against the public site", () => {
  test("every merged fix detected as live, with exact values read from the PR diff", async () => {
    const run = await runLiveCheck(
      SITE,
      [
        fix("meta-description", '+<meta name="description" content="Acme helps small teams ship analytics in a day, with a free tier and plain pricing.">'),
        fix("canonical-url"),
        fix("json-ld-org"),
        fix("h1-rewrite", '-<h1 class="hero">Welcome</h1>\n+<h1 class="hero">Product analytics for small teams</h1>'),
        fix("pricing-link"),
        fix("image-alt"),
        fix("sitemap-robots"),
      ],
      page(LIVE_HTML, { "/robots.txt": 200, "/sitemap.xml": 200 }),
    );
    expect(run.fetchError).toBeUndefined();
    expect(run.results.filter((r) => !r.ok)).toEqual([]);
    expect(run.passed).toBe(7);
  });

  test("not deployed yet: old headline and missing canonical are reported, not passed", async () => {
    const stale = LIVE_HTML.replace('<link rel="canonical" href="https://acme.example/">', "").replace(
      "Product analytics for small teams",
      "Welcome",
    );
    const run = await runLiveCheck(
      SITE,
      [fix("canonical-url"), fix("h1-rewrite", '+<h1 class="hero">Product analytics for small teams</h1>')],
      page(stale),
    );
    expect(run.passed).toBe(0);
    expect(run.results.map((r) => r.ok)).toEqual([false, false]);
  });

  test("Next.js metadata diff: the description value is read from `description: \"…\"`", async () => {
    const run = await runLiveCheck(
      SITE,
      [fix("meta-description", '+  description: "Something else entirely that is long enough to count as a description.",')],
      page(LIVE_HTML),
    );
    expect(run.results[0].ok).toBe(false);
    expect(run.results[0].detail).toContain("differs");
  });

  test("an unreachable site is a fetch error, not a failed fix", async () => {
    const run = await runLiveCheck(SITE, [fix("canonical-url")], async () => new Response("nope", { status: 503 }));
    expect(run.fetchError).toBe("HTTP 503");
    expect(run.results).toEqual([]);
  });
});

describe("live check — schedule and regressions", () => {
  const merged = "2026-10-04T10:00:00Z";
  const at = (iso: string) => new Date(iso);
  const run = (passed: number, total: number, checkedAt: string, oks: boolean[] = []): LiveCheckRun => ({
    checkedAt,
    siteUrl: SITE,
    passed,
    total,
    regressed: [],
    results: oks.map((ok, i) => ({ fixer: `f${i}`, label: `F${i}`, ok, detail: "" })),
  });

  test("first check waits for the deploy, then retries every 10 minutes for a day, then weekly", () => {
    expect(liveCheckDue(merged, undefined, at("2026-10-04T10:05:00Z"))).toBe(false);
    expect(liveCheckDue(merged, undefined, at("2026-10-04T10:11:00Z"))).toBe(true);
    const pending = nextLiveCheckState(undefined, run(1, 2, "2026-10-04T10:11:00Z", [true, false]), merged, at("2026-10-04T10:11:00Z"));
    expect(pending.settled).toBe(false);
    expect(liveCheckDue(merged, pending, at("2026-10-04T10:15:00Z"))).toBe(false);
    expect(liveCheckDue(merged, pending, at("2026-10-04T10:22:00Z"))).toBe(true);
    const done = nextLiveCheckState(pending, run(2, 2, "2026-10-04T10:22:00Z", [true, true]), merged, at("2026-10-04T10:22:00Z"));
    expect(done.settled).toBe(true);
    expect(liveCheckDue(merged, done, at("2026-10-05T10:22:00Z"))).toBe(false);
    expect(liveCheckDue(merged, done, at("2026-10-11T10:23:00Z"))).toBe(true);
  });

  test("a fix that was live and disappears is flagged as a regression", () => {
    const settled = nextLiveCheckState(undefined, run(2, 2, "2026-10-04T10:22:00Z", [true, true]), merged, at("2026-10-04T10:22:00Z"));
    const later = nextLiveCheckState(settled, run(1, 2, "2026-10-11T10:23:00Z", [true, false]), merged, at("2026-10-11T10:23:00Z"));
    expect(later.last?.regressed).toEqual(["f1"]);
    expect(later.history?.length).toBe(2);
  });
});

describe("live check — cron orchestration", () => {
  test("checks due merged jobs, stores the state and writes an audit row", async () => {
    const job = {
      id: "job-1",
      user_id: "u1",
      report_id: "r1",
      connection_id: "c1",
      provider: "github",
      status: "completed",
      current_step: "done",
      input: {},
      step_outputs: { apply: { prNumber: 3 } },
      error: null,
      wait_reason: null,
      locked_until: null,
      attempts: 0,
      pr_number: 3,
      pr_state: "merged",
      merged_at: "2026-10-04T10:00:00Z",
    } as AgentJobRow;
    const saved: unknown[] = [];
    const audits: unknown[] = [];
    const port: LiveCheckDbPort = {
      listMergedJobs: async () => [job],
      getAppliedFixes: async () => [fix("canonical-url")],
      getSiteUrl: async () => SITE,
      saveLiveCheck: async (_j, state) => void saved.push(state),
      audit: async (e) => void audits.push(e),
    };
    const out = await syncLiveChecks(port, page(LIVE_HTML), { now: () => new Date("2026-10-04T10:30:00Z") });
    expect(out).toEqual({ checked: 1, allLive: 1, regressions: 0, errors: 0 });
    expect(saved.length).toBe(1);
    expect((audits[0] as { action_type: string }).action_type).toBe("verify_live");
  });
});
