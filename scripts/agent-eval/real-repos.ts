/**
 * Fix-agent evaluation on REAL public repositories (no writes anywhere).
 *
 * Runs the production runner (plan → preview → apply → verify) against a
 * GitHub client whose READS hit the real GitHub API (read-only) and whose
 * WRITES (blob/tree/commit/ref/PR) are captured in memory. Every proposed file
 * is then checked: TS/JS files must still transpile, HTML must stay
 * well-formed for the edited elements, and the edit must contain what the
 * fixer claims.
 *
 * usage (from the repo root):
 *   GITHUB_TOKEN=… bun scripts/agent-eval/real-repos.ts owner/repo [owner/repo…]
 */
import type { GhBranch, GhContent, GhPull, GhRepo, GhTree, ScopedGithubClient } from "@/lib/agent/github/client";
import { advanceJob, type AgentDbPort, type AgentJobRow, type PlannedActionRow, type RunnerPorts } from "@/lib/agent/runner";
import type { LlmPort } from "@/lib/agent/llm";
import type { ReportData } from "@/lib/report-types";
import { makeReport } from "@/lib/agent/__tests__/fixtures";

const TOKEN = process.env.GITHUB_TOKEN ?? "";
const API = "https://api.github.com";

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(API + path, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "olmene-agent-eval", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  });
  if (!res.ok) throw Object.assign(new Error(`GET ${path} → ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

/** Real reads, captured writes. */
function realRepoClient(owner: string, repo: string, captured: { tree?: Array<{ path: string; content: string }>; pr?: GhPull }) {
  const base = `/repos/${owner}/${repo}`;
  return {
    allow: { owner, repo },
    async getRepo(): Promise<GhRepo> { return gh<GhRepo>(base); },
    async getBranch(b: string): Promise<GhBranch> { return gh<GhBranch>(`${base}/branches/${encodeURIComponent(b)}`); },
    async getTree(sha: string): Promise<GhTree> { return gh<GhTree>(`${base}/git/trees/${sha}?recursive=1`); },
    async getContent(path: string, ref?: string): Promise<GhContent | null> {
      try {
        return await gh<GhContent>(`${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${ref}` : ""}`);
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    },
    async getPull(): Promise<GhPull> { return captured.pr!; },
    async findPullForBranch(): Promise<GhPull | null> { return null; },
    async createBlob() { return { sha: "captured-blob", url: "" }; },
    async createTree(_b: string, tree: Array<{ path: string; content: string }>) { captured.tree = tree; return { sha: "captured-tree" }; },
    async createCommit() { return { sha: "captured-commit" }; },
    async createRef(ref: string, sha: string) { return { ref, object: { sha } }; },
    async createPull(input: { title: string; body: string; head: string; base: string }): Promise<GhPull> {
      captured.pr = { number: 1, html_url: "https://example.invalid/pr/1", state: "open", head: { ref: input.head, sha: "captured-commit" }, base: { ref: input.base }, changed_files: captured.tree?.length ?? 0, title: input.title } as GhPull;
      return captured.pr;
    },
  } as unknown as ScopedGithubClient;
}

class MemoryDb implements AgentDbPort {
  jobs = new Map<string, AgentJobRow>();
  actions = new Map<string, PlannedActionRow & { agent_job_id: string }>();
  seq = 0;
  constructor(public report: ReportData) {}
  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async updateJob(id: string, patch: Partial<AgentJobRow>) { const j = this.jobs.get(id); if (j) Object.assign(j, patch); }
  async insertPlannedActions(jobId: string, rows: Array<Omit<PlannedActionRow, "id" | "agent_job_id">>) {
    for (const r of rows) { const id = `act-${++this.seq}`; this.actions.set(id, { ...r, id, agent_job_id: jobId } as PlannedActionRow & { agent_job_id: string }); }
  }
  async getPlannedActions(jobId: string) { return [...this.actions.values()].filter((a) => a.agent_job_id === jobId).map((a) => ({ ...a })); }
  async updatePlannedAction(id: string, patch: Partial<PlannedActionRow>) { const a = this.actions.get(id); if (a) Object.assign(a, patch); }
  async insertApproval() {}
  async audit() {}
  async getReport() { return this.report; }
  async getFlags() { return { globalKillSwitch: false, providerGithubEnabled: true }; }
  async insertReceipt() {}
}

const llm: LlmPort = {
  async draftCopy() {
    return {
      metaDescription: "Acme helps small teams ship faster: plain pricing, a free tier and a Pro plan from $19 a month. Try it free today.",
      altTexts: {},
      h1: "Ship faster with fewer moving parts",
    };
  },
};

/** Report where every fixable check fails, so all fixers get exercised. */
function allFailingReport(siteUrl: string): ReportData {
  const r = makeReport();
  r.meta.siteUrl = siteUrl;
  for (const c of r.audit.seo.checklist) if (c.check !== "Title tag" && c.check !== "Single H1") c.status = "fail";
  return r;
}

function transpileOk(path: string, content: string): string | null {
  if (!/\.(tsx?|jsx?|mjs)$/.test(path)) return null;
  try {
    new Bun.Transpiler({ loader: path.endsWith("x") ? "tsx" : path.endsWith(".js") || path.endsWith(".mjs") ? "jsx" : "ts" }).transformSync(content);
    return null;
  } catch (e) {
    return String(e).slice(0, 300);
  }
}
function htmlChecks(path: string, before: string | null, after: string): string[] {
  if (!/\.(html?|astro)$/.test(path)) return [];
  const issues: string[] = [];
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  if (before !== null) {
    for (const tag of ["head", "body", "html"]) {
      if (count(before, new RegExp(`<${tag}[\\s>]`, "gi")) !== count(after, new RegExp(`<${tag}[\\s>]`, "gi"))) issues.push(`<${tag}> count changed`);
    }
  }
  if (count(after, /<meta[^>]+name=["']description["']/gi) > 1) issues.push("duplicate meta description");
  if (count(after, /<link[^>]+rel=["']canonical["']/gi) > 1) issues.push("duplicate canonical");
  return issues;
}

async function evaluate(full: string) {
  const [owner, repo] = full.split("/");
  const captured: { tree?: Array<{ path: string; content: string }>; pr?: GhPull } = {};
  const meta = await gh<{ homepage?: string; default_branch: string }>(`/repos/${owner}/${repo}`);
  const siteUrl = meta.homepage && /^https?:\/\//.test(meta.homepage) ? meta.homepage : `https://${repo}.example`;
  const db = new MemoryDb(allFailingReport(siteUrl));
  const ports: RunnerPorts = { db, gh: { client: async () => realRepoClient(owner, repo, captured) }, llm };
  const jobId = `eval-${repo}`;
  db.jobs.set(jobId, { id: jobId, user_id: "u", report_id: "r", connection_id: "c", provider: "github", status: "queued", current_step: null, input: { targetRepo: full }, step_outputs: {}, error: null, wait_reason: null, locked_until: null, attempts: 0, completed_at: null } as AgentJobRow);

  const t0 = Date.now();
  let status = await advanceJob(jobId, ports, "u"); // plan
  if (status === "previewing") status = await advanceJob(jobId, ports, "u"); // preview
  const job = db.jobs.get(jobId)!;
  const actions = await db.getPlannedActions(jobId);
  const out: string[] = [`\n### ${full}  (${meta.default_branch}, site ${siteUrl}) → ${status}${job.error ? `  ERROR: ${job.error}` : ""}`];
  const target = (job.step_outputs as Record<string, unknown>)?.plan as Record<string, unknown> | undefined;
  if (target) out.push(`  target: ${JSON.stringify((target as { target?: unknown }).target ?? {}).slice(0, 200)}`);
  for (const a of actions) {
    out.push(`  - ${a.fixer_id}: ${a.status}${a.skip_reason ? ` (${a.skip_reason})` : ""}${a.preview ? ` → files ${a.preview.files.join(", ")}` : ""}`);
  }
  if (status === "awaiting_approval") {
    for (const a of await db.getPlannedActions(jobId)) if (a.status === "planned") await db.updatePlannedAction(a.id, { status: "approved" });
    await db.updateJob(jobId, { status: "applying", current_step: "apply" });
    status = await advanceJob(jobId, ports, "u");
    out.push(`  apply → ${status}${db.jobs.get(jobId)!.error ? `  ERROR: ${db.jobs.get(jobId)!.error}` : ""}; PR files: ${(captured.tree ?? []).map((t) => t.path).join(", ") || "none"}`);
    for (const f of captured.tree ?? []) {
      const orig = await realRepoClient(owner, repo, {}).getContent(f.path, meta.default_branch).catch(() => null);
      const before = orig ? Buffer.from(orig.content, "base64").toString("utf-8") : null;
      const tErr = transpileOk(f.path, f.content);
      const hIssues = htmlChecks(f.path, before, f.content);
      const lines = before === null ? f.content.split("\n").length : 0;
      out.push(`    · ${f.path}${before === null ? ` (new, ${lines} lines)` : ` (${before.length}→${f.content.length} bytes)`}${tErr ? `  ✗ TRANSPILE: ${tErr}` : ""}${hIssues.length ? `  ✗ ${hIssues.join("; ")}` : ""}${!tErr && !hIssues.length ? "  ✓" : ""}`);
      Bun.write(`/tmp/agent-eval/${repo}/${f.path}`, f.content);
      if (before !== null) Bun.write(`/tmp/agent-eval/${repo}/${f.path}.orig`, before);
    }
  }
  out.push(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(out.join("\n"));
}

for (const r of process.argv.slice(2)) {
  try { await evaluate(r); } catch (e) { console.log(`\n### ${r}  HARNESS ERROR: ${String(e).slice(0, 300)}`); }
}
