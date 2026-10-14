/** Engine v1 additions: SPA targets, hero copy, llms.txt, page language, lite reports, grounded copy, live checks. */
import { describe, expect, test } from "bun:test";
import { detectTarget, replaceExactText } from "../htmlfile";
import { buildLlmsTxt, getFixer, guessLanguage, type FixerContext } from "../fixers";
import { liteReportFromScan, splitTitle } from "../lite-report";
import { buildPlan } from "../planner";
import { runLiveCheck } from "../live-check";
import type { LlmPort } from "../llm";
import type { ReportData } from "@/lib/report-types";
import { makeReport } from "./fixtures";

const VITE_INDEX = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Acme</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

function ctxFor(report: ReportData, over: Partial<FixerContext> = {}): FixerContext {
  return {
    report,
    siteUrl: "https://acme.test",
    homepagePath: "index.html",
    homepageHtml: VITE_INDEX,
    treePaths: ["index.html", "vite.config.ts", "package.json", "src/main.tsx"],
    packageJson: '{"dependencies":{"react":"18"}}',
    repo: { owner: "acme", name: "site", defaultBranch: "main" },
    copy: {},
    framework: null,
    spa: { kind: "vite" },
    ...over,
  };
}

describe("single-page apps", () => {
  test("Vite and Create React App repos are detected; SSR frameworks are not", () => {
    expect(detectTarget(["index.html", "vite.config.ts", "package.json", "src/main.tsx"])).toEqual({ homepagePath: "index.html", repoType: "spa", spaKind: "vite" });
    expect(detectTarget(["public/index.html", "src/index.js", "package.json"])).toEqual({ homepagePath: "public/index.html", repoType: "spa", spaKind: "cra" });
    expect(detectTarget(["index.html", "vite.config.ts", "svelte.config.js", "package.json"]).repoType).toBe("framework");
  });

  test("head fixes edit index.html; body fixes and canonical skip with a reason", () => {
    const report = makeReport();
    const meta = getFixer("meta-description")!.build(ctxFor(report, { copy: { metaDescription: "Acme builds fine widgets for teams that ship fast, with a free tier and Pro." } }));
    expect("edits" in meta && meta.edits[0].path).toBe("index.html");
    for (const id of ["image-alt", "pricing-link", "canonical-url", "hero-copy"]) {
      const out = getFixer(id)!.build(ctxFor(report, { copy: { h1: "Fine widgets" } }));
      expect("skip" in out).toBe(true);
    }
  });

  test("robots.txt and sitemap.xml go in public/, social tags leave out og:url", () => {
    const report = makeReport();
    const files = getFixer("sitemap-robots")!.build(ctxFor(report));
    expect("edits" in files && files.edits.map((e) => e.path).sort()).toEqual(["public/robots.txt", "public/sitemap.xml"]);
    const social = getFixer("social-meta")!.build(ctxFor(makeReport({
      audit: { ...report.audit, seo: { ...report.audit.seo, checklist: [{ check: "Open Graph tags", status: "warn", detail: "none" }] } },
    })));
    expect("edits" in social && social.edits[0].after.includes("og:url")).toBe(false);
    expect("edits" in social && social.edits[0].after.includes("og:title")).toBe(true);
  });
});

describe("hero copy from the report's grounded rewrites", () => {
  const html = `<html><body><h1>We build widgets</h1><p class="sub">Tools for developers.</p><a class="btn" href="/signup">Sign up</a></body></html>`;
  const report = makeReport({
    conversionDiff: {
      fields: [
        { kind: "subheadline", before: "Tools for developers.", after: "Ship widgets in a day, without a platform team.", rationale: "Names the outcome", tag: "clarity", snippetHtml: "", lengthDelta: 20, lengthWarn: false },
        { kind: "cta", before: "Sign up", after: "Start free", rationale: "Lower commitment", tag: "cta", snippetHtml: "", lengthDelta: 3, lengthWarn: false },
      ],
    },
  });

  test("replaces only verbatim, unique visible text and keeps markup", () => {
    const out = getFixer("hero-copy")!.build(ctxFor(report, { spa: null, homepageHtml: html }));
    expect("edits" in out).toBe(true);
    if ("edits" in out) {
      expect(out.edits[0].after).toContain('<p class="sub">Ship widgets in a day, without a platform team.</p>');
      expect(out.edits[0].after).toContain('<a class="btn" href="/signup">Start free</a>');
    }
  });

  test("ambiguous text (appears twice) is never replaced", () => {
    expect(replaceExactText("<a>Sign up</a><b>Sign up</b>", "Sign up", "Start free")).toBeNull();
  });

  test("the planner prefers the grounded H1 over a fresh draft (and skips the AI when that's all it needs)", async () => {
    let calls = 0;
    const llm: LlmPort = { draftCopy: async () => { calls++; return { h1: "Something else entirely" }; } };
    const grounded = makeReport({
      audit: { ...makeReport().audit, seo: { checklist: [{ check: "Single H1", status: "fail", detail: "0" }], findings: [] } },
      conversionDiff: { fields: [{ kind: "h1", before: "We build widgets", after: "Widgets your team ships in a day", rationale: "outcome", tag: "clarity", snippetHtml: "", lengthDelta: 10, lengthWarn: false }] },
    });
    const plan = await buildPlan(grounded, llm);
    expect(plan.copy.h1).toBe("Widgets your team ships in a day");
    expect(calls).toBe(0);
  });
});

describe("llms.txt and page language", () => {
  test("llms.txt is built from report facts only", () => {
    const txt = buildLlmsTxt(makeReport(), "https://acme.test");
    expect(txt.startsWith("# Acme\n\n> Acme builds fine widgets")).toBe(true);
    expect(txt).toContain("- [Home](https://acme.test/)");
  });

  test("llms.txt triggers only when the free scan found none", async () => {
    const without = await buildPlan(makeReport(), { draftCopy: async () => ({}) });
    expect(without.candidates.some((c) => c.fixerId === "llms-txt")).toBe(false);
    const scanSaysMissing = makeReport({ meta: { ...makeReport().meta, extras: [{ id: "llms-txt", status: "warn", detail: "none" }] } });
    const withIt = await buildPlan(scanSaysMissing, { draftCopy: async () => ({}) });
    expect(withIt.candidates.some((c) => c.fixerId === "llms-txt")).toBe(true);
  });

  test("language guess needs clear evidence", () => {
    const en = "The fastest way for your team to ship widgets. Our tools are built for teams that care about the details and the outcome, with support that answers in minutes and pricing that is clear for you.".repeat(2);
    const de = "Die schnellste Art für Ihr Team, Widgets auszuliefern. Wir bauen Werkzeuge für Teams, die Wert auf Details legen und mit Support, der in Minuten antwortet. Das ist unser Versprechen für Sie und Ihre Kunden.".repeat(2);
    expect(guessLanguage(en)).toBe("en");
    expect(guessLanguage(de)).toBe("de");
    expect(guessLanguage("Widgets")).toBeNull();
  });
});

describe("lite reports from a saved scan", () => {
  test("brand and one-liner come from the page's own title and description", () => {
    expect(splitTitle("Acme — Analytics for small teams", "acme.io")).toEqual({ name: "Acme", rest: "Analytics for small teams" });
    expect(splitTitle("Analytics for small teams | Acme", "acme.io").name).toBe("Acme");
    const r = liteReportFromScan({
      id: "s1",
      site_url: "https://acme.io/",
      result: {
        siteUrl: "https://acme.io/",
        checklist: [{ check: "Meta description", status: "fail", detail: "missing" }],
        stats: { title: "Acme — Analytics for small teams", h1: "Know your users", metaDescription: null },
        extras: [{ id: "llms-txt", status: "warn", detail: "none" }],
      },
      page_text: "Acme helps small teams understand their users.",
      profile: null,
    });
    expect(r.meta.lite).toBe(true);
    expect(r.product.name).toBe("Acme");
    expect(r.product.oneLiner).toBe("Analytics for small teams");
    expect(r.audit.seo.checklist).toHaveLength(1);
    expect(r.meta.pageExcerpt).toContain("small teams");
  });
});

describe("live re-checks for the new fixers", () => {
  test("lang, llms.txt and hero copy are verified on the live site", async () => {
    const page = `<html lang="en"><body><p>Ship widgets in a day, without a platform team.</p></body></html>`;
    const fetchFn = async (url: string) =>
      url.endsWith("/llms.txt") ? new Response("# Acme", { status: 200 }) : new Response(page, { status: 200, headers: { "content-type": "text/html" } });
    const run = await runLiveCheck("https://acme.test", [
      { fixer_id: "lang-attribute", preview: null },
      { fixer_id: "llms-txt", preview: null },
      { fixer_id: "hero-copy", preview: { edits: [{ diff: '-<p>Tools for developers.</p>\n+<p>Ship widgets in a day, without a platform team.</p>' }] } },
    ], fetchFn as typeof fetch);
    expect(run.results.map((r) => [r.fixer, r.ok])).toEqual([["lang-attribute", true], ["llms-txt", true], ["hero-copy", true]]);
  });
});

describe("atomic lease", () => {
  test("a run whose lease another driver holds is left alone", async () => {
    const { advanceJob } = await import("../runner");
    let updates = 0;
    const job = { id: "j1", user_id: "u1", report_id: "r1", connection_id: null, provider: "github", status: "queued", current_step: null, input: {}, step_outputs: {}, error: null, wait_reason: null, locked_until: null, attempts: 0 };
    const db = {
      getJob: async () => ({ ...job }),
      claimJob: async () => false,
      updateJob: async () => { updates++; },
    } as unknown as import("../runner").AgentDbPort;
    const status = await advanceJob("j1", { db, gh: {} as never, llm: {} as never }, "u1");
    expect(status).toBe("queued");
    expect(updates).toBe(0);
  });
});

describe("GitHub client resilience", () => {
  test("reads retry transient failures; writes do not", async () => {
    const { ScopedGithubClient, isTransient, backoffMs } = await import("../github/client");
    expect(isTransient(502, "")).toBe(true);
    expect(isTransient(403, "You have exceeded a secondary rate limit")).toBe(true);
    expect(isTransient(403, "Resource not accessible by integration")).toBe(false);
    expect(backoffMs(1, new Headers({ "retry-after": "2" }))).toBe(2000);
    let calls = 0;
    const flaky = (async () => {
      calls++;
      return calls < 2 ? new Response("oops", { status: 502 }) : new Response(JSON.stringify({ full_name: "acme/site", default_branch: "main" }), { status: 200 });
    }) as unknown as typeof fetch;
    const allow = { owner: "acme", repo: "site", defaultBranch: "main", installationId: 1, allowedRepos: ["acme/site"] };
    const gh = new ScopedGithubClient({ token: "ghs_test", allow: allow as never, apiBase: "https://api.test", fetchFn: flaky });
    const repo = await gh.getRepo();
    expect(repo.full_name).toBe("acme/site");
    expect(calls).toBe(2);
  });
});

describe("preview deployment checks (before merge)", () => {
  const job = { id: "a1", user_id: "u1", report_id: "r1", connection_id: "c1", provider: "github", status: "completed", current_step: "done", input: {}, step_outputs: {}, error: null, wait_reason: null, locked_until: null, attempts: 0, pr_number: 7 } as never;
  const fixes = [{ fixer_id: "lang-attribute", preview: null }];
  const db = { listOpenPrJobs: async () => [], updateJob: async () => {}, audit: async () => {}, getAppliedFixes: async () => fixes };

  test("runs the live checks on the PR head's preview URL", async () => {
    const { checkPreview } = await import("../sync");
    const client = {
      listDeployments: async () => [{ id: 1, sha: "abc", environment: "Preview", created_at: "2026-10-13T10:00:00Z" }],
      listDeploymentStatuses: async () => [{ state: "success", environment_url: "https://site-git-olmene-fix.vercel.app", created_at: "2026-10-13T10:01:00Z" }],
    } as never;
    const fetchFn = async () => new Response('<html lang="en"><body>ok</body></html>', { status: 200 });
    const out = await checkPreview(client, job, "abc", db, fetchFn, new Date("2026-10-13T11:00:00Z"));
    expect(out?.url).toBe("https://site-git-olmene-fix.vercel.app/");
    expect([out?.passed, out?.total]).toEqual([1, 1]);
  });

  test("no Deployments permission → recorded once, not retried for a day", async () => {
    const { checkPreview } = await import("../sync");
    const { GithubApiError } = await import("../github/client");
    const client = { listDeployments: async () => { throw new GithubApiError(403, "Resource not accessible by integration"); } } as never;
    const out = await checkPreview(client, job, "abc", db, async () => new Response(""), new Date("2026-10-13T11:00:00Z"));
    expect(out?.available).toBe(false);
    const again = await checkPreview(client, { ...(job as object), step_outputs: { previewCheck: out } } as never, "abc", db, async () => new Response(""), new Date("2026-10-13T15:00:00Z"));
    expect(again).toBeNull();
  });
});
