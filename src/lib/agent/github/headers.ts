/**
 * Headers for every request to GitHub. GitHub rejects API calls that carry no
 * User-Agent with 403 "Request forbidden by administrative rules", and the
 * Workers runtime's fetch sends none by default — so every call goes through
 * here rather than spelling its own headers.
 */
export const GITHUB_USER_AGENT = "Olmene/1.0 (+https://olmene.com)";

/** REST API headers (api.github.com), plus any per-call extras such as Authorization. */
export function githubHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": GITHUB_USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}
