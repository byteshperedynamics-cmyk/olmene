import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { ScopedGithubClient, mintInstallationToken } from "../github/client";
import { GITHUB_USER_AGENT, githubHeaders } from "../github/headers";

// GitHub answers 403 to any API call without a User-Agent, and the Workers
// runtime sends none by default — production connects failed on exactly this.
function recordingFetch(body: unknown) {
  const seen: Headers[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { seen, fetchFn };
}

describe("GitHub request headers", () => {
  test("githubHeaders always carries the User-Agent and keeps extras", () => {
    const h = githubHeaders({ Authorization: "Bearer x" });
    expect(h["User-Agent"]).toBe(GITHUB_USER_AGENT);
    expect(h["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(h.Authorization).toBe("Bearer x");
  });

  test("scoped client requests send a User-Agent", async () => {
    const { seen, fetchFn } = recordingFetch({ default_branch: "main" });
    const client = new ScopedGithubClient({ token: "ghs_test", allow: { owner: "octocat", repo: "site" }, fetchFn });
    await client.getRepo();
    expect(seen).toHaveLength(1);
    expect(seen[0].get("user-agent")).toBe(GITHUB_USER_AGENT);
    expect(seen[0].get("authorization")).toBe("Bearer ghs_test");
  });

  test("installation token minting sends a User-Agent", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const { seen, fetchFn } = recordingFetch({ token: "ghs_minted", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const out = await mintInstallationToken(
      { appId: "1", privateKeyPem: pem, clientId: "c", clientSecret: "s" },
      "ua-test-installation",
      { fetchFn, apiBase: "https://api.github.test" },
    );
    expect(out.token).toBe("ghs_minted");
    expect(seen[0].get("user-agent")).toBe(GITHUB_USER_AGENT);
  });
});
