// Regressions from the real-repo evaluation (2026-10-02): edits that would
// have shipped duplicate tags or a stale sitemap on arthelokyo/astrowind.
import { describe, expect, test } from "bun:test";
import { FIXERS, type FixerContext } from "../fixers";
import { makeReport } from "./fixtures";

const fixer = (id: string) => FIXERS.find((f) => f.id === id)!;
const ASTROWIND_LAYOUT = `---
import Metadata from '~/components/common/Metadata.astro';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <Metadata {...metadata} />
  </head>
  <body><slot /></body>
</html>`;

function ctx(over: Partial<FixerContext> = {}): FixerContext {
  return {
    report: makeReport(),
    siteUrl: "https://acme.test",
    homepagePath: null,
    homepageHtml: null,
    treePaths: ["astro.config.ts", "package.json", "src/pages/index.astro", "src/layouts/Layout.astro"],
    packageJson: '{"dependencies":{"astro":"5.0.0"}}',
    repo: { owner: "o", name: "r", defaultBranch: "main" },
    copy: { metaDescription: "Acme helps small teams ship faster with plain pricing and a free tier for everyone." },
    framework: { kind: "astro", headPath: "src/layouts/Layout.astro", headContent: ASTROWIND_LAYOUT, pagePath: "src/pages/index.astro", pageContent: "<h1>Hi</h1>" },
    ...over,
  };
}

describe("framework fixers respect SEO components and sitemap generators", () => {
  test("no meta description or canonical when the layout renders <Metadata />", () => {
    for (const id of ["meta-description", "canonical-url"]) {
      const out = fixer(id).build(ctx());
      expect("skip" in out && out.skip).toContain("through a component");
    }
  });

  test("no static sitemap when @astrojs/sitemap generates one; robots points at its index", () => {
    const out = fixer("sitemap-robots").build(ctx({ packageJson: '{"dependencies":{"@astrojs/sitemap":"3.0.0"}}' }));
    expect("edits" in out).toBe(true);
    if ("edits" in out) {
      expect(out.edits.map((e) => e.path)).toEqual(["public/robots.txt"]);
      expect(out.edits[0].after).toContain("Sitemap: https://acme.test/sitemap-index.xml");
    }
  });

  test("skips entirely when the project generates both files", () => {
    const out = fixer("sitemap-robots").build(ctx({ packageJson: '{"devDependencies":{"next-sitemap":"4.2.3"}}' }));
    expect("skip" in out && out.skip).toContain("next-sitemap");
  });

  test("skips sites served under a sub-path (GitHub Pages project sites): robots.txt only counts at the root", () => {
    for (const siteUrl of ["https://acme.github.io/site/", "https://acme.github.io/site"]) {
      const out = fixer("sitemap-robots").build(
        ctx({ siteUrl, framework: null, homepagePath: "index.html", homepageHtml: "<html><head></head><body></body></html>", treePaths: ["index.html"] }),
      );
      expect("skip" in out && out.skip).toContain("domain root");
    }
    const root = fixer("sitemap-robots").build(
      ctx({ siteUrl: "https://acme.test/", framework: null, homepagePath: "index.html", homepageHtml: "<html><head></head><body></body></html>", treePaths: ["index.html"] }),
    );
    expect("edits" in root && root.edits.map((e) => e.path)).toEqual(["robots.txt", "sitemap.xml"]);
  });
});
