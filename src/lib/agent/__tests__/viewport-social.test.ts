import { describe, expect, test } from "bun:test";
import { getFixer, remainingChecks, type FixerContext, type FixerBuildResult } from "../fixers";
import { insertMetaTags, insertViewport } from "../htmlfile";
import { runLiveCheck } from "../live-check";
import { BAD_HOMEPAGE, makeReport } from "./fixtures";

const report = makeReport({
  audit: {
    ...makeReport().audit,
    seo: {
      findings: [],
      checklist: [
        { check: "Meta description", status: "fail", detail: "missing" },
        { check: "Mobile viewport", status: "fail", detail: "No viewport meta tag" },
        { check: "Open Graph tags", status: "warn", detail: "Few or no og: tags" },
        { check: "Twitter card", status: "warn", detail: "No twitter: tags" },
        { check: "Content depth", status: "fail", detail: "~74 words of body text" },
        { check: "Favicon", status: "warn", detail: "No favicon link found" },
        { check: "Title tag", status: "pass", detail: "ok" },
      ],
    },
  },
});

function ctx(overrides: Partial<FixerContext> = {}): FixerContext {
  return {
    report,
    siteUrl: "https://acme.test",
    homepagePath: "index.html",
    homepageHtml: BAD_HOMEPAGE,
    treePaths: ["index.html"],
    repo: { owner: "acme", name: "site", defaultBranch: "main" },
    copy: {},
    framework: null,
    ...overrides,
  };
}

function built(outcome: ReturnType<NonNullable<ReturnType<typeof getFixer>>["build"]>): FixerBuildResult {
  if ("skip" in outcome) throw new Error(`unexpected skip: ${outcome.skip}`);
  return outcome;
}

describe("insertViewport", () => {
  test("goes right after <meta charset>", () => {
    const html = '<html><head>\n  <meta charset="utf-8">\n  <title>A</title>\n</head></html>';
    expect(insertViewport(html)).toBe(
      '<html><head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>A</title>\n</head></html>',
    );
  });

  test("falls back to the start of <head>; Astro gets a self-closing tag", () => {
    const out = insertViewport("<head>\n  <title>A</title>\n</head>", true)!;
    expect(out).toContain('<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1" />');
  });

  test("never adds a second viewport tag", () => {
    expect(insertViewport('<head><meta name="viewport" content="width=1024"></head>')).toBeNull();
    expect(insertViewport("<body>no head</body>")).toBeNull();
  });
});

describe("insertMetaTags", () => {
  test("adds only the missing tags before </head>, escaped", () => {
    const html = '<head>\n  <title>A</title>\n  <meta property="og:title" content="Keep me">\n</head>';
    const r = insertMetaTags(html, [
      { attr: "property", key: "og:title", content: "New" },
      { attr: "property", key: "og:description", content: 'Fast & "simple"' },
      { attr: "name", key: "twitter:card", content: "summary" },
    ])!;
    expect(r.added).toEqual(["og:description", "twitter:card"]);
    expect(r.html).toContain('content="Keep me"');
    expect(r.html).toContain('<meta property="og:description" content="Fast &amp; &quot;simple&quot;">\n  <meta name="twitter:card" content="summary">\n</head>');
  });

  test("null without </head>", () => {
    expect(insertMetaTags("<body></body>", [{ attr: "name", key: "twitter:card", content: "summary" }])).toBeNull();
  });
});

describe("viewport-meta fixer", () => {
  const fixer = getFixer("viewport-meta")!;

  test("triggers on the report check and edits the static homepage", () => {
    expect(fixer.detect(report).triggered).toBe(true);
    const r = built(fixer.build(ctx()));
    expect(r.edits[0].path).toBe("index.html");
    expect(r.edits[0].after).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  test("Next.js renders its own viewport tag — skipped", () => {
    const out = fixer.build(ctx({ framework: { kind: "nextjs-app", headPath: "src/app/layout.tsx", headContent: "export default function L() {}" } }));
    expect("skip" in out).toBe(true);
  });
});

describe("social-meta fixer", () => {
  const fixer = getFixer("social-meta")!;

  test("builds Open Graph + Twitter tags from the page's own title and description", () => {
    const html = BAD_HOMEPAGE.replace("</title>", '</title>\n  <meta name="description" content="Acme builds fine widgets &amp; tools for teams.">');
    const r = built(fixer.build(ctx({ homepageHtml: html })));
    const after = r.edits[0].after;
    expect(after).toContain('<meta property="og:title" content="Acme — Widgets">');
    expect(after).toContain('<meta property="og:description" content="Acme builds fine widgets &amp; tools for teams.">');
    expect(after).toContain('<meta property="og:url" content="https://acme.test/">');
    expect(after).toContain('<meta name="twitter:card" content="summary">');
  });

  test("falls back to the drafted description when the page has none", () => {
    const r = built(fixer.build(ctx({ copy: { metaDescription: "Drafted description for Acme widgets, built for small teams." } })));
    expect(r.edits[0].after).toContain('og:description" content="Drafted description for Acme widgets, built for small teams."');
  });

  test("a shared Astro layout is skipped (it would stamp the homepage on every page)", () => {
    const out = fixer.build(ctx({
      framework: { kind: "astro", headPath: "src/layouts/Base.astro", headContent: "<head><title>{title}</title></head>", pagePath: "src/pages/index.astro", pageContent: "<Base />" },
    }));
    expect("skip" in out).toBe(true);
  });
});

describe("remainingChecks", () => {
  test("lists what the PR does not fix, with the fixer's skip reason when there is one", () => {
    const rest = remainingChecks(report, [
      { fixer_id: "meta-description", status: "approved", skip_reason: null },
      { fixer_id: "viewport-meta", status: "applied", skip_reason: null },
      { fixer_id: "social-meta", status: "skipped", skip_reason: "The page already has these social tags." },
    ]);
    expect(rest.map((r) => r.check)).toEqual(["Content depth", "Open Graph tags", "Twitter card", "Favicon"]);
    expect(rest.find((r) => r.check === "Open Graph tags")!.note).toBe("The page already has these social tags.");
    expect(rest.find((r) => r.check === "Content depth")!.note).toContain("needs a content or design change");
  });
});

describe("live check for the new fixers", () => {
  test("viewport and social tags are verified on the public page", async () => {
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Acme"><meta property="og:url" content="https://acme.example/"><meta name="twitter:card" content="summary"></head><body></body></html>`;
    const fetchFn = async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    const run = await runLiveCheck("https://acme.example/", [
      { fixer_id: "viewport-meta", preview: null },
      { fixer_id: "social-meta", preview: null },
    ], fetchFn);
    expect(run.results.map((r) => r.ok)).toEqual([true, true]);
  });

  test("missing tags fail the live check", async () => {
    const fetchFn = async () => new Response("<html><head><title>A</title></head></html>", { status: 200 });
    const run = await runLiveCheck("https://acme.example/", [
      { fixer_id: "viewport-meta", preview: null },
      { fixer_id: "social-meta", preview: null },
    ], fetchFn);
    expect(run.results.map((r) => r.ok)).toEqual([false, false]);
  });
});
