import { describe, expect, test } from "bun:test";
import { validateGithubRequest, validatePlannedAction } from "../allowlist";
import { ScopedGithubClient } from "../github/client";

const allow = { owner: "octocat", repo: "site" };

describe("request-level allowlist", () => {
  test("allowed read paths pass", () => {
    for (const p of [
      "/repos/octocat/site",
      "/repos/octocat/site/branches/main",
      "/repos/octocat/site/contents/index.html",
      "/repos/octocat/site/contents/docs/readme.md?ref=main",
      "/repos/octocat/site/git/trees/abc?recursive=1",
      "/repos/octocat/site/pulls",
      "/repos/octocat/site/pulls/12",
      "/repos/octocat/site/pulls?head=octocat:branch&state=open",
    ]) {
      expect(validateGithubRequest("GET", p, allow).ok).toBe(true);
    }
  });

  test("allowed write paths pass", () => {
    for (const p of [
      "/repos/octocat/site/git/blobs",
      "/repos/octocat/site/git/trees",
      "/repos/octocat/site/git/commits",
      "/repos/octocat/site/git/refs",
      "/repos/octocat/site/pulls",
    ]) {
      expect(validateGithubRequest("POST", p, allow).ok).toBe(true);
    }
  });

  test("DELETE is always denied (branch deletion, repo deletion, everything)", () => {
    expect(validateGithubRequest("DELETE", "/repos/octocat/site/git/refs/heads/x", allow).ok).toBe(false);
    expect(validateGithubRequest("DELETE", "/repos/octocat/site", allow).ok).toBe(false);
  });

  test("PUT is always denied (kills force-push by construction)", () => {
    expect(validateGithubRequest("PUT", "/repos/octocat/site/git/refs/heads/x", allow).ok).toBe(false);
  });

  test("cross-repo access is denied", () => {
    expect(validateGithubRequest("GET", "/repos/octocat/other-repo", allow).ok).toBe(false);
    expect(validateGithubRequest("POST", "/repos/someoneelse/site/git/blobs", allow).ok).toBe(false);
  });

  test("unknown paths are denied by default", () => {
    for (const p of [
      "/user",
      "/repos/octocat/site/branches/main/protection",
      "/repos/octocat/site/admin",
      "/orgs/x",
      "/repos/octocat/site/invitations",
    ]) {
      expect(validateGithubRequest("GET", p, allow).ok).toBe(false);
    }
  });

  test("installation-level reads are limited to /installation/repositories", () => {
    expect(validateGithubRequest("GET", "/installation/repositories", null, { installationLevel: true }).ok).toBe(true);
    expect(validateGithubRequest("GET", "/installation/repositories", allow).ok).toBe(true);
    expect(validateGithubRequest("GET", "/user", null, { installationLevel: true }).ok).toBe(false);
    expect(validateGithubRequest("POST", "/installation/repositories", null, { installationLevel: true }).ok).toBe(false);
  });
});

describe("plan-level validation", () => {
  const fixers = new Set(["meta-description", "json-ld-org", "sitemap-robots"]);

  test("a normal, well-formed action passes", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "reversible_write",
          target: { owner: "octocat", repo: "site", path: "index.html", branch: "marketwise/fix-ab12cd34-a1" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(true);
  });

  test("unregistered fixer is rejected", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "rm-rf-everything",
          action_class: "reversible_write",
          target: { owner: "octocat", repo: "site", path: "index.html", branch: "marketwise/fix-x-a1" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });

  test("destructive class is rejected in v1", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "destructive",
          target: { owner: "octocat", repo: "site", path: "index.html", branch: "marketwise/fix-x-a1" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });

  test("default branch writes are refused", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "reversible_write",
          target: { owner: "octocat", repo: "site", path: "index.html", branch: "main" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });

  test("non-marketwise branches are refused", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "reversible_write",
          target: { owner: "octocat", repo: "site", path: "index.html", branch: "feature/x" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });

  test("cross-repo targets are refused", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "reversible_write",
          target: { owner: "victim", repo: "repo", path: "index.html", branch: "marketwise/fix-x-a1" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });

  test("protected paths and extensions are refused", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      "package.json",
      "index.php",
      "app.tsx",
      "scripts/deploy.sh",
      ".env",
    ]) {
      expect(
        validatePlannedAction(
          {
            fixer_id: "sitemap-robots",
            action_class: "reversible_write",
            target: { owner: "octocat", repo: "site", path, branch: "marketwise/fix-x-a1" },
          },
          allow,
          fixers,
          "main",
        ).ok,
      ).toBe(false);
    }
    // allowed extensions
    for (const path of ["index.html", "sitemap.xml", "robots.txt", "about.HTM"]) {
      expect(
        validatePlannedAction(
          {
            fixer_id: "sitemap-robots",
            action_class: "reversible_write",
            target: { owner: "octocat", repo: "site", path, branch: "marketwise/fix-x-a1" },
          },
          allow,
          fixers,
          "main",
        ).ok,
      ).toBe(true);
    }
  });

  test("path traversal is refused", () => {
    expect(
      validatePlannedAction(
        {
          fixer_id: "meta-description",
          action_class: "reversible_write",
          target: { owner: "octocat", repo: "site", path: "../etc/passwd", branch: "marketwise/fix-x-a1" },
        },
        allow,
        fixers,
        "main",
      ).ok,
    ).toBe(false);
  });
});

describe("ScopedGithubClient enforcement", () => {
  function makeClient() {
    const calls: Array<{ method: string; path: string }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ method: init?.method ?? "GET", path: u.replace("https://api.github.com", "") });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const client = new ScopedGithubClient({ token: "ghs_test_token", allow, fetchFn });
    return { client, calls };
  }

  test("blocked calls never reach the network", async () => {
    const { client, calls } = makeClient();
    expect(client.request("DELETE", "/repos/octocat/site/git/refs/heads/main")).rejects.toThrow("blocked by allowlist");
    expect(client.request("GET", "/repos/octocat/other")).rejects.toThrow("blocked by allowlist");
    expect(calls.length).toBe(0);
  });

  test("allowed calls reach the network with the token", async () => {
    const { client, calls } = makeClient();
    await client.getRepo();
    expect(calls).toEqual([{ method: "GET", path: "/repos/octocat/site" }]);
  });
});
