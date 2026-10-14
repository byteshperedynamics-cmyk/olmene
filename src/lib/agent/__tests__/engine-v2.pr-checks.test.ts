// Engine v2: PR checks compare a preview deployment with the live site.
import { describe, expect, test } from "bun:test";
import { comparePreview, PR_CHECK_FIXERS } from "../pr-checks";
import { runLiveCheck } from "../live-check";
import { validateGithubRequest } from "../allowlist";

const page = (html: string) => async () => new Response(html, { status: 200 });
const GOOD = `<html lang="en"><head><title>Acme — analytics for small teams</title><meta name="description" content="Acme gives small teams analytics in a day without a data engineer, with plain pricing."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://acme.test/"><meta property="og:title" content="Acme"><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head><body><h1>Analytics in a day</h1></body></html>`;

describe("PR checks", () => {
  test("a check that works live and breaks in the preview fails the PR", async () => {
    const fixes = PR_CHECK_FIXERS.map((fixer_id) => ({ fixer_id, preview: null }));
    const live = await runLiveCheck("https://acme.test", fixes, page(GOOD));
    const preview = await runLiveCheck("https://pr-4.acme.pages.dev", fixes, page(GOOD.replace(/<meta name="description"[^>]*>/, "").replace(' lang="en"', "")));
    const out = comparePreview(live, preview, "https://pr-4.acme.pages.dev");
    expect(out.conclusion).toBe("failure");
    expect(out.regressions).toEqual(["Meta description", "Page language"]);
    expect(out.title).toContain("2 checks would break");
    expect(out.text).toContain("| Meta description | ✅ | ❌");
  });

  test("no regressions passes, and improvements are named", async () => {
    const fixes = PR_CHECK_FIXERS.map((fixer_id) => ({ fixer_id, preview: null }));
    const live = await runLiveCheck("https://acme.test", fixes, page(GOOD.replace(/<link rel="canonical"[^>]*>/, "")));
    const preview = await runLiveCheck("https://p.acme.dev", fixes, page(GOOD));
    const out = comparePreview(live, preview, "https://p.acme.dev");
    expect(out.conclusion).toBe("success");
    expect(out.improvements).toEqual(["Canonical URL"]);
  });

  test("the scoped GitHub client may post check runs and list PRs, nothing broader", () => {
    const allow = { owner: "o", repo: "r" };
    expect(validateGithubRequest("POST", "/repos/o/r/check-runs", allow).ok).toBe(true);
    expect(validateGithubRequest("GET", "/repos/o/r/pulls?state=open&sort=updated&direction=desc&per_page=5", allow).ok).toBe(true);
    expect(validateGithubRequest("PATCH", "/repos/o/r/check-runs/1", allow).ok).toBe(false);
    expect(validateGithubRequest("POST", "/repos/o/other/check-runs", allow).ok).toBe(false);
  });
});
