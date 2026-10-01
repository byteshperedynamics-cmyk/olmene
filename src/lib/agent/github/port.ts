import type { getServiceDb } from "../db";
import type { AgentJobRow, GithubPort } from "../runner";
import { GithubApiError, loadGithubAppConfig, mintInstallationToken, ScopedGithubClient } from "./client";

/** Production GitHub port: mints a repo-narrowed installation token per job. */
export function makeGithubPort(db: ReturnType<typeof getServiceDb>): GithubPort {
  return {
    async client(job: AgentJobRow) {
      const app = await loadGithubAppConfig(db);
      if (!app) throw new GithubApiError(503, "GitHub App not configured");
      const { data: connection } = await db
        .from("connections")
        .select("external_installation_id, status")
        .eq("id", job.connection_id ?? "")
        .maybeSingle();
      if (!connection || connection.status !== "active") {
        throw new GithubApiError(403, "GitHub connection is not active — reconnect it on the Agent page.");
      }
      const input = job.input as { targetRepo?: string };
      const [owner, repo] = (input.targetRepo ?? "").split("/");
      // Narrow the token to exactly the target repo.
      let repoId: number | undefined;
      try {
        const { token } = await mintInstallationToken(app, connection.external_installation_id ?? "");
        const probe = new ScopedGithubClient({ token, allow: { owner, repo } });
        const info = await probe.getRepo();
        repoId = info.id;
      } catch {
        repoId = undefined; // fall back to installation-wide mint; allowlist still scopes calls
      }
      const { token } = await mintInstallationToken(app, connection.external_installation_id ?? "", {
        repositoryIds: repoId ? [repoId] : undefined,
      });
      return new ScopedGithubClient({ token, allow: { owner, repo } });
    },
  };
}
