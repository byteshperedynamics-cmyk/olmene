import { describe, expect, test } from "bun:test";
import { getFixer, remainingChecks, type FixerContext, type FixerBuildResult, type BuildOutcome } from "../fixers";
import { setTitleText } from "../htmlfile";
import { runLiveCheck } from "../live-check";
import { buildPlan } from "../planner";
import type { LlmPort } from "../llm";
import { BAD_HOMEPAGE, makeReport } from "./fixtures";

const report = makeReport({
  audit: {
    ...makeReport().audit,
    seo: {
      findings: [],
      checklist: [{ check: "Title tag", status: "warn", detail: "14 characters (aim for 10–60)" }],
    },
  },
});

const DRAFT = "Acme — fine widgets for teams that ship fast";

function ctx(overrides: Partial<FixerContext> = {}): FixerContext {
  return {
    report,
    siteUrl: "https://acme.test",
    homepagePath: "index.html",
    homepageHtml: BAD_HOMEPAGE,
    treePaths: ["index.html"],
    repo: { owner: "acme", name: "site", defaultBranch: "main" },
    copy: { title: DRAFT },
    framework: null,
    ...overrides,
  };
}

function built(outcome: BuildOutcome): FixerBuildResult {
  if ("skip" in outcome) throw new Error(`unexpected skip: ${outcome.skip}`);
  return outcome;
}

describe("setTitleText", () => {
  test("replaces a plain title and keeps its attributes", () => {
    expect(setTitleText('<head><title data-x="1">Old</title></head>', "New & better")).toBe(
      '<head><title data-x="1">New &amp; better</title></head>',
    );
  });

  test("inserts a title after charset/viewport when there is none", () => {
    const html = '<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width">\n</head>';
    expect(setTitleText(html, "Acme")).toBe(
      '<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width">\n  <title>Acme</title>\n</head>',
    );
  });

  test("never rewrites expressions, markup or duplicate titles", () => {
    expect(setTitleText("<head><title>{title}</title></head>", "X")).toBeNull();
    expect(setTitleText("<head><title><b>A</b></title></head>", "X")).toBeNull();
    expect(setTitleText("<head><title>A</title></head><svg><title>B</title></svg>", "X")).toBeNull();
  });
});

describe("title-tag fixer", () => {
  const fixer = getFixer("title-tag")!;

  test("rewrites the static homepage title", () => {
    expect(fixer.detect(report).triggered).toBe(true);
    const r = built(fixer.build(ctx()));
    expect(r.edits[0].after).toContain(`<title>Acme — fine widgets for teams that ship fast</title>`);
  });

  test("a draft outside 15–60 characters is not shipped", () => {
    expect("skip" in fixer.build(ctx({ copy: { title: "Acme" } }))).toBe(true);
    expect("skip" in fixer.build(ctx({ copy: { title: "x".repeat(61) } }))).toBe(true);
  });

  test("Next.js: edits the layout title only when it is the one measured live", () => {
    const layout = 'export const metadata = {\n  title: "Acme widgets",\n};\nexport default function L({ children }) { return children; }\n';
    const fw = { kind: "nextjs-app" as const, headPath: "app/layout.tsx", headContent: layout };
    // live title is 14 characters, the layout's "Acme widgets" is 12 → same title (±2)
    const r = built(fixer.build(ctx({ framework: fw })));
    expect(r.edits[0].after).toContain(`title: "${DRAFT}"`);
    // a page overrides the title (live 40 characters vs 12 in the layout) → leave the layout alone
    const other = makeReport({ audit: { ...report.audit, seo: { findings: [], checklist: [{ check: "Title tag", status: "warn", detail: "64 characters (aim for 10–60)" }] } } });
    expect("skip" in fixer.build(ctx({ report: other, framework: fw }))).toBe(true);
  });

  test("Astro: a shared layout is skipped", () => {
    const out = fixer.build(ctx({
      framework: { kind: "astro", headPath: "src/layouts/Base.astro", headContent: "<head><title>Acme</title></head>", pagePath: "src/pages/index.astro", pageContent: "<Base />" },
    }));
    expect("skip" in out).toBe(true);
  });

  test("a skipped title stays on the PR's list", () => {
    const rest = remainingChecks(report, [{ fixer_id: "title-tag", status: "skipped", skip_reason: "Drafted title is 4 characters" }]);
    expect(rest).toEqual([{ check: "Title tag", status: "warn", note: "Drafted title is 4 characters" }]);
  });
});

describe("planner drafts the title", () => {
  test("title copy is requested and parsed", async () => {
    let prompt = "";
    const llm: LlmPort = {
      draftCopy: async (_s, user) => {
        prompt = user;
        return { title: `  ${DRAFT}  ` };
      },
    };
    const plan = await buildPlan(report, llm, { homepageHtml: BAD_HOMEPAGE });
    expect(plan.candidates.map((c) => c.fixerId)).toContain("title-tag");
    expect(prompt).toContain("Current <title> text:");
    expect(plan.copy.title).toBe(DRAFT);
  });
});

describe("live check: title", () => {
  test("passes when the merged title is live", async () => {
    const diff = `+    <title>${DRAFT}</title>`;
    const fetchFn = async () => new Response(`<html><head><title>${DRAFT}</title></head></html>`, { status: 200 });
    const run = await runLiveCheck("https://acme.example/", [{ fixer_id: "title-tag", preview: { edits: [{ path: "index.html", diff }] } }], fetchFn);
    expect(run.results[0].ok).toBe(true);
  });

  test("fails while the old title is still live", async () => {
    const diff = `+    <title>${DRAFT}</title>`;
    const fetchFn = async () => new Response("<html><head><title>Acme</title></head></html>", { status: 200 });
    const run = await runLiveCheck("https://acme.example/", [{ fixer_id: "title-tag", preview: { edits: [{ path: "index.html", diff }] } }], fetchFn);
    expect(run.results[0].ok).toBe(false);
  });
});
