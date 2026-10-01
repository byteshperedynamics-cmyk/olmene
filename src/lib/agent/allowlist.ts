/**
 * Request-level allowlist for the GitHub scoped client (spec §5.2: least
 * privilege enforced in code, validated deterministically BEFORE execution).
 *
 * Deny-by-default. The only paths a Phase-1 job may touch are repo-scoped
 * read paths, the Git-Data write path (blobs → tree → commit → ref) and
 * pull-request creation. Every other method/path combination is rejected
 * here — including all DELETE (branch deletion) and all PUT (force-push),
 * which the spec blocks in v1 by design.
 */

export interface RepoAllowlist {
  owner: string;
  repo: string;
}

const READ_PATHS: RegExp[] = [
  /^\/repos\/[^/]+\/[^/]+(\?.*)?$/, // repo info
  /^\/repos\/[^/]+\/[^/]+\/branches\/[^/]+(\?.*)?$/,
  /^\/repos\/[^/]+\/[^/]+\/contents(\/[^/?]+)*(\?.*)?$/,
  /^\/repos\/[^/]+\/[^/]+\/git\/trees\/[^/]+(\?.*)?$/,
  /^\/repos\/[^/]+\/[^/]+\/pulls(\/\d+)?(\?.*)?$/,
];

const WRITE_PATHS: RegExp[] = [
  /^\/repos\/[^/]+\/[^/]+\/git\/blobs$/,
  /^\/repos\/[^/]+\/[^/]+\/git\/trees$/,
  /^\/repos\/[^/]+\/[^/]+\/git\/commits$/,
  /^\/repos\/[^/]+\/[^/]+\/git\/refs$/,
  /^\/repos\/[^/]+\/[^/]+\/pulls$/,
];

/** Installation-level reads (not repo-scoped). */
const INSTALLATION_PATHS: RegExp[] = [/^\/installation\/repositories$/];

export interface RequestCheck {
  ok: boolean;
  reason?: string;
}

export function validateGithubRequest(
  method: string,
  path: string,
  allow: RepoAllowlist | null,
  opts: { installationLevel?: boolean } = {},
): RequestCheck {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "POST") {
    return { ok: false, reason: `method ${m} is denied (only GET/POST allowed; DELETE/PUT blocked by policy)` };
  }

  // Installation-level (not repo-scoped) reads
  if (INSTALLATION_PATHS.some((re) => re.test(path))) {
    if (m !== "GET") return { ok: false, reason: `installation path ${path} is read-only` };
    return { ok: true };
  }
  if (opts.installationLevel) {
    return { ok: false, reason: `path ${path} not allowed in installation-level mode` };
  }

  const repoPrefix = `/repos/${allow?.owner ?? "…"}/${allow?.repo ?? "…"}`;
  if (!path.startsWith(`/repos/`)) {
    return { ok: false, reason: `path outside /repos/ is denied: ${path}` };
  }
  // Repo scoping: the path must reference EXACTLY the allowed owner/repo
  const match = path.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/.*)?$/);
  if (!match) return { ok: false, reason: `malformed repo path: ${path}` };
  const [, owner, repo] = match;
  if (!allow || `${owner}/${repo}` !== `${allow.owner}/${allow.repo}`) {
    return { ok: false, reason: `cross-repo access denied: ${owner}/${repo} (allowed: ${repoPrefix})` };
  }
  if (m === "GET" && READ_PATHS.some((re) => re.test(path))) return { ok: true };
  if (m === "POST" && WRITE_PATHS.some((re) => re.test(path))) return { ok: true };
  return { ok: false, reason: `path not on the allowlist: ${m} ${path}` };
}

// ───────────────────────────────────────────────────────────────────────────
// Plan-level validation — runs before apply regardless of what the planner
// produced (the LLM never gets a vote on this).
// ───────────────────────────────────────────────────────────────────────────

export const ALLOWED_FILE_EXTENSIONS = [".html", ".htm", ".txt", ".xml"];

/**
 * Source files a fixer may edit in framework repos — exact, known locations
 * only (brief §6.2). Anything else with a code extension is refused.
 */
export const FRAMEWORK_EDIT_PATHS: RegExp[] = [
  /^(src\/)?app\/layout\.(tsx|jsx|ts|js)$/, // Next.js root layout (metadata + <body>)
  /^(src\/)?components\/olmene-jsonld\.(tsx|jsx)$/, // the JSON-LD component Olmene adds
  /^src\/layouts\/[A-Za-z0-9_-]+\.astro$/, // Astro layouts (<head>)
  /^src\/pages\/index\.astro$/, // Astro homepage
];

/** True when a fixer may write this path (extension + location policy). */
export function isAllowedEditPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (ALLOWED_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return FRAMEWORK_EDIT_PATHS.some((re) => re.test(path));
}

/** Paths a fixer may never touch regardless of anything else. */
const FORBIDDEN_PATH_PREFIXES = [
  ".github/",
  ".git",
  ".env",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "deno.lock",
  "yarn.lock",
  "tsconfig",
  "next.config",
  "wrangler",
  "Dockerfile",
  "docker-compose",
  ".pem",
  "id_rsa",
];

export interface PlannedActionLike {
  fixer_id: string;
  action_class: string;
  target: { repo?: string; owner?: string; path?: string; branch?: string };
}

export interface PlanCheck {
  ok: boolean;
  reason?: string;
}

export function validatePlannedAction(
  action: PlannedActionLike,
  allow: RepoAllowlist,
  registeredFixers: Set<string>,
  defaultBranch: string,
): PlanCheck {
  if (!registeredFixers.has(action.fixer_id)) {
    return { ok: false, reason: `fixer not in registry: ${action.fixer_id}` };
  }
  if (action.action_class !== "reversible_write") {
    return { ok: false, reason: `action class ${action.action_class} is not allowed (v1: reversible writes only)` };
  }
  const { owner, repo, path, branch } = action.target ?? {};
  if (!owner || !repo || `${owner}/${repo}` !== `${allow.owner}/${allow.repo}`) {
    return { ok: false, reason: `target repo ${owner}/${repo} outside allowlist ${allow.owner}/${allow.repo}` };
  }
  if (!path) return { ok: false, reason: "missing target path" };
  if (!path.startsWith("olmene/") && FORBIDDEN_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return { ok: false, reason: `protected path: ${path}` };
  }
  if (!isAllowedEditPath(path)) {
    return { ok: false, reason: `file not allowed for fixers: ${path}` };
  }
  if (!branch || !branch.startsWith("olmene/fix-")) {
    return { ok: false, reason: `branch must be an olmene/fix- branch, got: ${branch}` };
  }
  if (branch === defaultBranch || branch === `refs/heads/${defaultBranch}`) {
    return { ok: false, reason: `refusing to write to default branch ${defaultBranch}` };
  }
  if (path.includes("..") || path.startsWith("/")) {
    return { ok: false, reason: `suspicious path: ${path}` };
  }
  return { ok: true };
}
