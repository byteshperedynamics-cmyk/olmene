/**
 * Scoped GitHub client + installation-token minting.
 *
 * Token lifecycle (verified against current docs — docs/integrations.md §1):
 *  - installation tokens are minted per installation via app JWT, live 1 h,
 *    and can be NARROWED at mint time with `repository_ids` — we always
 *    narrow to the single target repo of the job.
 *  - tokens live only in this module (in-memory cache) and are never
 *    persisted, logged, or returned to callers.
 *  - every request passes validateGithubRequest() BEFORE the network — the
 *    allowlist is enforced here, not in the planner or the LLM.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, masterKeyFromEnv } from "../crypto";
import { AgentConfigError, githubApiBase, getEnv } from "../env";
import { validateGithubRequest, type RepoAllowlist } from "../allowlist";
import { createAppJwt, githubErrorMessage } from "./jwt";
import { githubHeaders } from "./headers";

export interface GithubAppConfig {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKeyPem: string;
  appSlug?: string;
}

/**
 * Load the GitHub App credentials from `agent_app_config`.
 * Secret values are stored as full envelope strings in `value_ciphertext`
 * (produced by encryptSecret with the env master key).
 */
export async function loadGithubAppConfig(db: SupabaseClient): Promise<GithubAppConfig | null> {
  const { data, error } = await db
    .from("agent_app_config")
    .select("name, is_secret, value_text, value_ciphertext, metadata")
    .eq("provider", "github");
  if (error) throw new Error(`app config read failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  const byName = new Map(data.map((r: Record<string, unknown>) => [r.name as string, r]));
  const appId = byName.get("app_id")?.value_text as string | undefined;
  const clientId = byName.get("client_id")?.value_text as string | undefined;
  if (!appId || !clientId) return null;

  let masterKey: CryptoKey;
  try {
    masterKey = await masterKeyFromEnv(requireMasterKey());
  } catch {
    // Missing/invalid master key → credentials are unreadable → treat as
    // "not configured" (the UI prompts to register the app again).
    return null;
  }
  const clientSecret = await decryptEncrypted(byName.get("client_secret"), masterKey);
  const privateKey = await decryptEncrypted(byName.get("private_key"), masterKey);
  if (!clientSecret || !privateKey) return null;

  const meta = (byName.get("app_id")?.metadata as Record<string, unknown>) ?? {};
  return {
    appId,
    clientId,
    clientSecret,
    privateKeyPem: privateKey,
    appSlug: typeof meta.app_slug === "string" ? meta.app_slug : undefined,
  };
}

function requireMasterKey(): string {
  const k = getEnv("MW_KMS_MASTER_KEY");
  if (!k) throw new AgentConfigError("MW_KMS_MASTER_KEY missing (Worker secret) — cannot decrypt provider credentials");
  return k;
}

async function decryptEncrypted(row: Record<string, unknown> | undefined, masterKey: CryptoKey): Promise<string | null> {
  if (!row) return null;
  const ct = row.value_ciphertext;
  if (typeof ct !== "string" || !ct.startsWith("v1.")) return null;
  try {
    return await decryptSecret(masterKey, ct);
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Installation token minting + cache
// ───────────────────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

/** Per-isolate cache. Key: `${installationId}:${repoIds ?? 'all'}` */
const tokenCache = new Map<string, CachedToken>();

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GithubApiError";
  }
}

export async function mintInstallationToken(
  app: GithubAppConfig,
  installationId: string,
  opts: { repositoryIds?: number[]; apiBase?: string; fetchFn?: typeof fetch } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const cacheKey = `${installationId}:${opts.repositoryIds?.join(",") ?? "all"}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { token: cached.token, expiresAt: new Date(cached.expiresAt) };
  }
  const jwt = createAppJwt(app.appId, app.privateKeyPem);
  const res = await (opts.fetchFn ?? fetch)(
    `${opts.apiBase ?? githubApiBase()}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: githubHeaders({ Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }),
      body: JSON.stringify(opts.repositoryIds ? { repository_ids: opts.repositoryIds } : {}),
    },
  );
  if (!res.ok) {
    throw new GithubApiError(res.status, await githubErrorMessage(res));
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  const expiresAt = new Date(body.expires_at).getTime();
  tokenCache.set(cacheKey, { token: body.token, expiresAt });
  return { token: body.token, expiresAt: new Date(expiresAt) };
}

/** Drop cached tokens for an installation (disconnect/revocation path). */
export function evictInstallationTokens(installationId: string): void {
  for (const key of [...tokenCache.keys()]) {
    if (key.startsWith(`${installationId}:`)) tokenCache.delete(key);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Scoped client — the ONLY object fixers may use to talk to GitHub
// ───────────────────────────────────────────────────────────────────────────

export interface ScopedGithubOptions {
  token: string;
  allow: RepoAllowlist | null;
  apiBase?: string;
  fetchFn?: typeof fetch;
}

const GH_TIMEOUT_MS = 20_000;
const GH_READ_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 5xx, 429 and GitHub's secondary rate limit (a 403 that says so) are worth retrying. */
export function isTransient(status: number, message: string): boolean {
  return status >= 500 || status === 429 || (status === 403 && /rate limit/i.test(message));
}

/** Wait before the next attempt: Retry-After / X-RateLimit-Reset when given (capped at 10 s), else 0.5 s, 1.5 s. */
export function backoffMs(attempt: number, headers: Headers | null, now = Date.now()): number {
  const retryAfter = Number(headers?.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  const reset = Number(headers?.get("x-ratelimit-reset"));
  if (headers?.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) && reset > 0) return Math.min(Math.max(reset * 1000 - now, 0), 10_000);
  return attempt === 1 ? 500 : 1500;
}

export class ScopedGithubClient {
  private readonly token: string;
  readonly allow: RepoAllowlist | null;
  private readonly apiBase: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: ScopedGithubOptions) {
    this.token = opts.token;
    this.allow = opts.allow;
    this.apiBase = opts.apiBase ?? githubApiBase();
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** Raw request with allowlist enforcement. NEVER bypass this. */
  async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    opts: { installationLevel?: boolean } = {},
  ): Promise<T> {
    const check = validateGithubRequest(method, path, this.allow, { installationLevel: opts.installationLevel });
    if (!check.ok) {
      throw new GithubApiError(403, `blocked by allowlist: ${check.reason}`);
    }
    // Reads retry transient failures (5xx, rate limits, timeouts) with backoff;
    // writes never retry here (the runner retries the whole step, with its
    // PR idempotency check), they only get a timeout.
    const attempts = method === "GET" ? GH_READ_ATTEMPTS : 1;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(`${this.apiBase}${path}`, {
          method,
          headers: githubHeaders({
            Authorization: `Bearer ${this.token}`,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          }),
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(GH_TIMEOUT_MS),
        });
      } catch (e) {
        if (attempt < attempts) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        const name = e instanceof Error ? e.name : "";
        throw new GithubApiError(0, name === "TimeoutError" || name === "AbortError" ? `GitHub did not answer within ${GH_TIMEOUT_MS / 1000} s` : "GitHub could not be reached");
      }
      if (!res.ok) {
        const message = await githubErrorMessage(res);
        if (attempt < attempts && isTransient(res.status, message)) {
          await sleep(backoffMs(attempt, res.headers));
          continue;
        }
        throw new GithubApiError(res.status, message);
      }
      if (res.status === 204) return undefined as unknown as T;
      return (await res.json()) as T;
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────
  getRepo(): Promise<GhRepo> {
    return this.request<GhRepo>("GET", `/repos/${this.allow!.owner}/${this.allow!.repo}`);
  }
  getBranch(branch: string): Promise<GhBranch> {
    return this.request<GhBranch>(
      "GET",
      `/repos/${this.allow!.owner}/${this.allow!.repo}/branches/${encodeURIComponent(branch)}`,
    );
  }
  getTree(sha: string, recursive = true): Promise<GhTree> {
    return this.request<GhTree>(
      "GET",
      `/repos/${this.allow!.owner}/${this.allow!.repo}/git/trees/${encodeURIComponent(sha)}${recursive ? "?recursive=1" : ""}`,
    );
  }
  async getContent(path: string, ref?: string): Promise<GhContent | null> {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    try {
      return await this.request<GhContent>(
        "GET",
        `/repos/${this.allow!.owner}/${this.allow!.repo}/contents/${encoded}${q}`,
      );
    } catch (e) {
      if (e instanceof GithubApiError && e.status === 404) return null;
      throw e;
    }
  }
  getPull(number: number): Promise<GhPull> {
    return this.request<GhPull>("GET", `/repos/${this.allow!.owner}/${this.allow!.repo}/pulls/${number}`);
  }
  /** Find an open PR for a head ref (idempotency check). head format: `owner:branch`. */
  async findPullForBranch(head: string): Promise<GhPull | null> {
    const list = await this.request<GhPull[]>(
      "GET",
      `/repos/${this.allow!.owner}/${this.allow!.repo}/pulls?head=${encodeURIComponent(head)}&state=open`,
    );
    return list && list.length > 0 ? list[0] : null;
  }
  /** Deployments GitHub recorded for a commit (Vercel, Netlify, Cloudflare Pages… report previews here). */
  listDeployments(sha: string): Promise<GhDeployment[]> {
    return this.request<GhDeployment[]>("GET", `/repos/${this.allow!.owner}/${this.allow!.repo}/deployments?sha=${encodeURIComponent(sha)}&per_page=10`);
  }
  listDeploymentStatuses(id: number): Promise<GhDeploymentStatus[]> {
    return this.request<GhDeploymentStatus[]>("GET", `/repos/${this.allow!.owner}/${this.allow!.repo}/deployments/${id}/statuses?per_page=10`);
  }
  listInstallationRepos(): Promise<{ total_count: number; repositories: GhRepo[] }> {
    return this.request("GET", "/installation/repositories", undefined, { installationLevel: true });
  }

  // ── Write path (blobs → tree → commit → ref → PR) ─────────────────────
  createBlob(content: string, encoding: "utf-8" | "base64"): Promise<{ sha: string; url: string }> {
    return this.request("POST", `/repos/${this.allow!.owner}/${this.allow!.repo}/git/blobs`, { content, encoding });
  }
  createTree(
    baseTreeSha: string,
    tree: Array<{ path: string; mode: "100644"; type: "blob"; sha?: string; content?: string }>,
  ): Promise<{ sha: string }> {
    return this.request("POST", `/repos/${this.allow!.owner}/${this.allow!.repo}/git/trees`, {
      base_tree: baseTreeSha,
      tree,
    });
  }
  createCommit(message: string, treeSha: string, parents: string[]): Promise<{ sha: string }> {
    return this.request("POST", `/repos/${this.allow!.owner}/${this.allow!.repo}/git/commits`, {
      message,
      tree: treeSha,
      parents,
    });
  }
  createRef(ref: string, sha: string): Promise<{ ref: string; object: { sha: string } }> {
    return this.request("POST", `/repos/${this.allow!.owner}/${this.allow!.repo}/git/refs`, { ref, sha });
  }
  createPull(input: { title: string; body: string; head: string; base: string; draft?: boolean }): Promise<GhPull> {
    return this.request("POST", `/repos/${this.allow!.owner}/${this.allow!.repo}/pulls`, input);
  }
}

/** Decode the contents-API base64 payload to text. */
export function decodeContent(content: GhContent): string {
  if (content.encoding !== "base64" || typeof content.content !== "string") {
    throw new GithubApiError(500, "unexpected content encoding");
  }
  const bin = atob(content.content.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── GitHub API shapes (only the fields we use) ─────────────────────────────

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  html_url: string;
  private: boolean;
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

export interface GhBranch {
  name: string;
  /** `commit.commit.tree.sha` is the head commit's tree (GET /branches returns it). */
  commit: { sha: string; commit?: { tree?: { sha: string } } };
  protected: boolean;
}

export interface GhTree {
  sha: string;
  tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number }>;
  truncated?: boolean;
}

export interface GhContent {
  name: string;
  path: string;
  sha: string;
  content?: string;
  encoding?: string;
  type: string;
}

export interface GhPull {
  number: number;
  html_url: string;
  state: "open" | "closed";
  /** Set by GitHub when the PR was merged (null when closed unmerged / open). */
  merged_at?: string | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  changed_files?: number;
  title: string;
}

export interface GhDeployment {
  id: number;
  sha: string;
  environment: string;
  created_at: string;
}

export interface GhDeploymentStatus {
  state: "error" | "failure" | "inactive" | "in_progress" | "queued" | "pending" | "success";
  environment_url?: string | null;
  target_url?: string | null;
  created_at: string;
}

export interface GhInstallation {
  id: number;
  account: { login: string; type: string };
  repository_selection: "all" | "selected";
  html_url?: string;
  permissions?: Record<string, string>;
}
