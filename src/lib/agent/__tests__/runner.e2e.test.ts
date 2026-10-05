/**
 * End-to-end runner test: the FULL job flow against a fake GitHub and an
 * in-memory DB. Verifies the spec's acceptance criteria for Phase 1:
 *   - the test repo gets a correct PR (right branch, right files, right content)
 *   - the model never sees a token (no token string in any audit row, receipt,
 *     or planned action; the fake LLM's inputs are also scanned)
 *   - logs stay secret-free (redaction is unit-tested; here we assert the
 *     token value never enters the audit trail at all)
 *   - kill switch blocks writes; apply is idempotent (no duplicate PRs)
 */

import { describe, expect, test } from "bun:test";
import type { ScopedGithubClient, GhRepo, GhBranch, GhTree, GhContent, GhPull } from "../github/client";
import { advanceJob, type AgentDbPort, type AgentJobRow, type GithubPort, type PlannedActionRow, type RunnerPorts } from "../runner";
import type { LlmPort } from "../llm";
import type { ReportData } from "@/lib/report-types";
import { makeReport, BAD_HOMEPAGE } from "./fixtures";

const FAKE_TOKEN = "ghs_987654321_fakeinstallationtoken";

// ── Fake GitHub ─────────────────────────────────────────────────────────────

class FakeGithub {
  files = new Map<string, string>([["index.html", BAD_HOMEPAGE]]);
  branches = new Map<string, string>([["main", "sha-main-0001"]]);
  prs: GhPull[] = [];
  nextPr = 1;
  nextSha = 0;
  commits: Array<{ message: string; tree: Array<{ path: string; content: string }> }> = [];
  createdBranches: string[] = [];
  commitTrees = new Map<string, string>([["sha-main-0001", "tree-main-0001"]]);
  commitParents = new Map<string, string[]>();
  treeBases: string[] = [];
  mintCount = 0;

  client(): ScopedGithubClient {
    this.mintCount++;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return {
      allow: { owner: "octocat", repo: "site" },
      async request(): Promise<never> {
        throw new Error("fake client methods must be called directly");
      },
      async getRepo(): Promise<GhRepo> {
        return {
          id: 555001,
          name: "site",
          full_name: "octocat/site",
          owner: { login: "octocat" },
          default_branch: "main",
          html_url: "https://github.com/octocat/site",
          private: false,
        };
      },
      async getBranch(branch: string): Promise<GhBranch> {
        const sha = self.branches.get(branch);
        if (!sha) throw Object.assign(new Error("branch not found"), { status: 404 });
        return { name: branch, commit: { sha, commit: { tree: { sha: self.commitTrees.get(sha) ?? `tree-of-${sha}` } } }, protected: false };
      },
      async getTree(): Promise<GhTree> {
        return {
          sha: "sha-tree",
          tree: [...self.files.keys()].map((p) => ({ path: p, mode: "100644", type: "blob", sha: `sha-${p}` })),
        };
      },
      async getContent(path: string): Promise<GhContent | null> {
        const content = self.files.get(path);
        if (content === undefined) return null;
        return {
          name: path.split("/").pop() ?? path,
          path,
          sha: `sha-${path}`,
          content: Buffer.from(content, "utf-8").toString("base64"),
          encoding: "base64",
          type: "file",
        };
      },
      async getPull(n: number): Promise<GhPull> {
        const pr = self.prs.find((p) => p.number === n);
        if (!pr) throw Object.assign(new Error("PR not found"), { status: 404 });
        return { ...pr };
      },
      async findPullForBranch(head: string): Promise<GhPull | null> {
        const branch = head.split(":")[1] ?? "";
        return self.prs.find((p) => p.head.ref === branch && p.state === "open") ?? null;
      },
      async createBlob(): Promise<{ sha: string; url: string }> {
        return { sha: `sha-blob-${self.nextSha++}`, url: "https://github.com/blob" };
      },
      async createTree(base: string, tree: Array<{ path: string; content: string }>): Promise<{ sha: string }> {
        self.lastTree = tree;
        self.treeBases.push(base);
        return { sha: `sha-tree-${self.nextSha++}` };
      },
      async createCommit(message: string, treeSha: string, parents: string[]): Promise<{ sha: string }> {
        const sha = `sha-commit-${self.nextSha++}`;
        self.commitTrees.set(sha, treeSha);
        self.commitParents.set(sha, parents);
        // Attach the tree contents to the LAST createTree call for assertions
        // (the runner sends contents via the tree, not blobs)
        self.commits.push({ message, tree: self.lastTree ?? [] });
        self.lastTree = undefined;
        return { sha };
      },
      async createRef(ref: string, sha: string): Promise<{ ref: string; object: { sha: string } }> {
        const branch = ref.replace("refs/heads/", "");
        self.branches.set(branch, sha);
        self.createdBranches.push(branch);
        return { ref, object: { sha } };
      },
      async createPull(input: { title: string; body: string; head: string; base: string }): Promise<GhPull> {
        // Like GitHub: the PR head is wherever the branch points, and a branch
        // with no commits beyond the base is refused (422).
        const headSha = self.branches.get(input.head);
        if (!headSha) throw Object.assign(new Error("head branch not found"), { status: 422 });
        if (headSha === self.branches.get(input.base)) {
          throw Object.assign(new Error(`No commits between ${input.base} and ${input.head}`), { status: 422 });
        }
        const pr: GhPull = {
          number: self.nextPr++,
          html_url: `https://github.com/octocat/site/pull/${self.nextPr - 1}`,
          state: "open",
          head: { ref: input.head, sha: headSha },
          base: { ref: input.base },
          changed_files: self.filesTouched ?? 1,
          title: input.title,
        };
        self.prs.push(pr);
        return pr;
      },
      lastTree: undefined as Array<{ path: string; content: string }> | undefined,
      filesTouched: undefined as number | undefined,
    } as unknown as ScopedGithubClient;
  }
}

// ── In-memory DB port ───────────────────────────────────────────────────────

class MemoryDb implements AgentDbPort {
  jobs = new Map<string, AgentJobRow>();
  actions = new Map<string, PlannedActionRow & { agent_job_id: string }>();
  auditRows: Array<Record<string, unknown>> = [];
  receipts: Array<{ jobId: string; userId: string; content: string }> = [];
  report: ReportData;
  flags = { globalKillSwitch: false, providerGithubEnabled: true };
  seq = 0;

  constructor(report: ReportData) {
    this.report = report;
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }
  async updateJob(jobId: string, patch: Partial<AgentJobRow>) {
    const j = this.jobs.get(jobId);
    if (j) Object.assign(j, patch);
  }
  async insertPlannedActions(jobId: string, rows: Array<Omit<PlannedActionRow, "id" | "agent_job_id">>) {
    for (const r of rows) {
      const id = `act-${++this.seq}`;
      this.actions.set(id, { ...r, id, agent_job_id: jobId } as PlannedActionRow & { agent_job_id: string });
    }
  }
  async getPlannedActions(jobId: string) {
    return [...this.actions.values()].filter((a) => a.agent_job_id === jobId).map((a) => ({ ...a }));
  }
  async updatePlannedAction(id: string, patch: Partial<PlannedActionRow>) {
    const a = this.actions.get(id);
    if (a) Object.assign(a, patch);
  }
  async insertApproval() {}
  async audit(entry: Record<string, unknown>) {
    this.auditRows.push(entry);
  }
  async getReport() {
    return this.report;
  }
  async getFlags() {
    return { ...this.flags };
  }
  async insertReceipt(jobId: string, userId: string, content: string) {
    this.receipts.push({ jobId, userId, content });
  }
}

// ── LLM port (records its prompts for the token-leak assertion) ────────────

class RecordingLlm implements LlmPort {
  prompts: string[] = [];
  async draftCopy(systemPrompt: string, userPrompt: string): Promise<unknown> {
    this.prompts.push(systemPrompt + "\n" + userPrompt);
    return {
      metaDescription: "Acme builds fine widgets for teams that ship fast — free tier and Pro at $19/mo.",
      altTexts: { "hero.png": "A rendered Acme widget on a desk" },
      h1: "Fine widgets for teams that ship fast",
    };
  }
}

function makeFixture() {
  const gh = new FakeGithub();
  const db = new MemoryDb(makeReport());
  const llm = new RecordingLlm();
  const ports: RunnerPorts = {
    db,
    gh: { client: async () => gh.client() },
    llm,
  };
  const jobId = "job-0001-ab12cd34";
  db.jobs.set(jobId, {
    id: jobId,
    user_id: "user-1",
    report_id: "rep-1",
    connection_id: "conn-1",
    provider: "github",
    status: "queued",
    current_step: null,
    input: { targetRepo: "octocat/site" },
    step_outputs: {},
    error: null,
    wait_reason: null,
    locked_until: null,
    attempts: 0,
    completed_at: null,
  });
  return { gh, db, llm, ports, jobId };
}

/** Simulate the approve route's effect (entitlement lives in the route). */
async function approveAll(db: MemoryDb, jobId: string) {
  const actions = await db.getPlannedActions(jobId);
  for (const a of actions) {
    if (a.status === "planned") await db.updatePlannedAction(a.id, { status: "approved" });
  }
  await db.updateJob(jobId, { status: "applying", current_step: "apply" });
}

// ── The flow ────────────────────────────────────────────────────────────────

describe("agent runner E2E (fake GitHub)", () => {
  test("queued → planning → preview → approval → apply → verify → receipt", async () => {
    const { gh, db, llm, ports, jobId } = makeFixture();

    // 1. planning
    let status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("previewing");
    const planned = await db.getPlannedActions(jobId);
    expect(planned.length).toBeGreaterThan(3);
    expect(planned.every((a) => a.action_class === "reversible_write")).toBe(true);

    // 2. previewing → awaiting approval
    status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("awaiting_approval");
    const previews = await db.getPlannedActions(jobId);
    const viable = previews.filter((a) => a.status === "planned" && a.preview);
    const skipped = previews.filter((a) => a.status === "skipped");
    expect(viable.length).toBeGreaterThanOrEqual(4);
    expect(skipped.length).toBe(0);
    for (const a of viable) {
      expect(a.preview?.edits.length).toBeGreaterThan(0);
      expect(String(a.preview?.evidence).length).toBeGreaterThan(10);
      expect(a.preview?.revertSteps.length).toBeGreaterThan(0);
    }

    // 3. approval + apply
    await approveAll(db, jobId);
    status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("verifying");

    // The PR exists with the right shape
    expect(gh.prs.length).toBe(1);
    const pr = gh.prs[0];
    expect(pr.base.ref).toBe("main");
    expect(pr.head.ref).toBe("olmene/fix-job-0001-a1");
    expect(gh.createdBranches).toEqual(["olmene/fix-job-0001-a1"]);
    expect(pr.title).toContain("report-proven");

    // The commit content composed ALL fixes into the files
    const commit = gh.commits[gh.commits.length - 1];
    const indexHtml = commit.tree.find((t) => t.path === "index.html")?.content ?? "";
    expect(indexHtml).toContain('<meta name="description"'); // meta description
    expect(indexHtml).toContain('rel="canonical"'); // canonical
    expect(indexHtml).toContain("application/ld+json"); // JSON-LD
    expect(indexHtml).toContain('alt="A rendered Acme widget on a desk"'); // alt text
    expect(indexHtml).toContain('href="/pricing.html"'); // pricing link
    expect(indexHtml).toContain("Fine widgets for teams that ship fast"); // H1 rewrite
    // New files created
    const paths = commit.tree.map((t) => t.path);
    expect(paths).toContain("robots.txt");
    expect(paths).toContain("sitemap.xml");
    // Classes preserved
    expect(indexHtml).toContain('class="nav-link"');
    expect(indexHtml).toContain('class="hero"');

    // 4. verify → completed + receipt
    status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("completed");
    expect(db.receipts.length).toBe(1);
    expect(db.receipts[0].content).toContain("fix receipt");
    expect(db.receipts[0].content).toContain("How to undo");

    // 5. Audit trail exists and contains NO tokens anywhere
    const auditBlob = JSON.stringify(db.auditRows) + db.receipts[0].content + JSON.stringify(await db.getPlannedActions(jobId));
    expect(auditBlob).not.toContain(FAKE_TOKEN);
    expect(auditBlob).not.toMatch(/ghs_[A-Za-z0-9_]+/);

    // 6. The LLM never saw a token either
    const promptBlob = llm.prompts.join("\n");
    expect(promptBlob).not.toContain(FAKE_TOKEN);
    expect(promptBlob).not.toMatch(/ghs_[A-Za-z0-9_]+/);

    // 7. Default branch untouched
    expect(gh.branches.get("main")).toBe("sha-main-0001");
  });

  test("kill switch stops the job before any write", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    await advanceJob(jobId, ports, "user-1"); // planning
    await advanceJob(jobId, ports, "user-1"); // preview
    await approveAll(db, jobId);
    db.flags.globalKillSwitch = true;
    const status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("killed");
    expect(gh.prs.length).toBe(0);
    expect(gh.createdBranches.length).toBe(0);
    expect(db.auditRows.some((r) => r.action_type === "kill_block")).toBe(true);
  });

  test("apply is idempotent — a replay never opens a second PR", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    await advanceJob(jobId, ports, "user-1");
    await advanceJob(jobId, ports, "user-1");
    await approveAll(db, jobId);
    await advanceJob(jobId, ports, "user-1"); // apply → verifying (PR #1)
    expect(gh.prs.length).toBe(1);

    // Simulate a crash-before-status-update replay: force back to applying
    await db.updateJob(jobId, { status: "applying", current_step: "apply", locked_until: null, attempts: 0 });
    const status = await advanceJob(jobId, ports, "user-1");
    expect(status).toBe("verifying");
    expect(gh.prs.length).toBe(1); // no duplicate
  });

  test("unsupported repo (framework) skips gracefully and completes", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    gh.files.delete("index.html");
    gh.files.set("package.json", "{}");
    gh.files.set("next.config.ts", "export default {}");
    await advanceJob(jobId, ports, "user-1"); // planning
    const status = await advanceJob(jobId, ports, "user-1"); // preview → all skipped
    expect(status).toBe("completed");
    const actions = await db.getPlannedActions(jobId);
    // only sitemap-robots can still act (new files at root); others must skip
    const htmlFixers = actions.filter((a) => a.fixer_id !== "sitemap-robots");
    for (const a of htmlFixers) {
      expect(a.status).toBe("skipped");
      expect(a.skip_reason).toBeTruthy();
    }
    expect(gh.prs.length).toBe(0);
  });

  test("attempts exhaust → job fails with a user-safe error", async () => {
    const { gh, ports, jobId } = makeFixture();
    // Make GitHub blow up on reads
    gh.files.clear();
    const broken = {
      ...ports,
      gh: {
        client: async () => {
          throw new Error("github down (token ghs_ohno12345 leaked in an error?)");
        },
      },
    } as RunnerPorts;
    let status = "";
    for (let i = 0; i < 6; i++) status = await advanceJob(jobId, broken, "user-1");
    expect(status).toBe("failed");
    const job = await ports.db.getJob(jobId);
    expect(job?.error).not.toContain("ghs_ohno12345"); // userSafe() scrubs it
    expect(job?.error).toContain("[REDACTED]");
  });

  // ── Framework repos (brief §6.2) ─────────────────────────────────────────

  const NEXT_LAYOUT = [
    'import type { Metadata } from "next";',
    'import "./globals.css";',
    "",
    "export const metadata: Metadata = {",
    '  title: "Acme",',
    "};",
    "",
    "export default function RootLayout({ children }: { children: React.ReactNode }) {",
    "  return (",
    '    <html lang="en">',
    "      <body>{children}</body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");

  async function runToApply(ports: RunnerPorts, db: MemoryDb, jobId: string) {
    await advanceJob(jobId, ports, "user-1"); // planning
    const status = await advanceJob(jobId, ports, "user-1"); // preview
    return { status, actions: await db.getPlannedActions(jobId) };
  }

  test("Next.js App Router repo: metadata, canonical, JSON-LD and public/ files ship in one PR", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    gh.files.clear();
    gh.files.set("package.json", "{}");
    gh.files.set("next.config.ts", "export default {}");
    gh.files.set("app/layout.tsx", NEXT_LAYOUT);
    gh.files.set("app/page.tsx", "export default function Page() { return <h1>We build widgets</h1>; }");

    const { status, actions } = await runToApply(ports, db, jobId);
    expect(status).toBe("awaiting_approval");
    const byId = Object.fromEntries(actions.map((a) => [a.fixer_id, a]));
    for (const id of ["meta-description", "canonical-url", "json-ld-org", "sitemap-robots"]) {
      expect(byId[id]?.status).toBe("planned");
    }
    // component-level changes are skipped with a reason, never guessed
    for (const id of ["image-alt", "pricing-link", "h1-rewrite"]) {
      expect(byId[id]?.status).toBe("skipped");
      expect(String(byId[id]?.skip_reason)).toContain("component code");
    }

    await approveAll(db, jobId);
    expect(await advanceJob(jobId, ports, "user-1")).toBe("verifying");
    const commit = gh.commits[gh.commits.length - 1];
    const paths = commit.tree.map((t) => t.path).sort();
    expect(paths).toEqual(["app/layout.tsx", "components/olmene-jsonld.tsx", "public/robots.txt", "public/sitemap.xml"]);
    const layout = commit.tree.find((t) => t.path === "app/layout.tsx")!.content;
    // all three edits composed into the one layout file
    expect(layout).toContain('description: "Acme builds fine widgets for teams that ship fast');
    expect(layout).toContain('alternates: { canonical: "./" },');
    expect(layout).toContain('metadataBase: new URL("https://acme.test/"),');
    expect(layout).toContain('import { OlmeneJsonLd } from "../components/olmene-jsonld";');
    expect(layout).toContain("<body>\n        <OlmeneJsonLd />{children}</body>");
    expect(layout).toContain('title: "Acme",');
    const comp = commit.tree.find((t) => t.path === "components/olmene-jsonld.tsx")!.content;
    expect(comp).toContain('"@type": "Organization"');
    expect(comp).toContain("export function OlmeneJsonLd()");
    expect(gh.branches.get("main")).toBe("sha-main-0001");
  });

  test("Next.js with generateMetadata: metadata fixers skip with a reason, others still work", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    gh.files.clear();
    gh.files.set("next.config.mjs", "export default {}");
    gh.files.set(
      "src/app/layout.tsx",
      'export async function generateMetadata() { return { title: "x" }; }\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\n',
    );
    const { actions } = await runToApply(ports, db, jobId);
    const byId = Object.fromEntries(actions.map((a) => [a.fixer_id, a]));
    expect(byId["meta-description"].status).toBe("skipped");
    expect(String(byId["meta-description"].skip_reason)).toContain("generateMetadata");
    expect(byId["canonical-url"].status).toBe("skipped");
    expect(byId["json-ld-org"].status).toBe("planned");
    expect(byId["json-ld-org"].preview?.files).toEqual(["src/components/olmene-jsonld.tsx", "src/app/layout.tsx"]);
  });

  test("Astro repo: head fixes land in the layout, the H1 in index.astro", async () => {
    const { gh, db, ports, jobId } = makeFixture();
    gh.files.clear();
    gh.files.set("astro.config.mjs", "export default {}");
    gh.files.set(
      "src/layouts/Layout.astro",
      ["---", "const { title } = Astro.props;", "---", "<html lang=\"en\">", "  <head>", "    <title>{title}</title>", "  </head>", "  <body><slot /></body>", "</html>", ""].join("\n"),
    );
    gh.files.set(
      "src/pages/index.astro",
      ["---", "import Layout from \"../layouts/Layout.astro\";", "---", "<Layout title=\"Acme\">", "  <h1 class=\"hero\">We build widgets</h1>", "</Layout>", ""].join("\n"),
    );
    const { status, actions } = await runToApply(ports, db, jobId);
    expect(status).toBe("awaiting_approval");
    const byId = Object.fromEntries(actions.map((a) => [a.fixer_id, a]));
    expect(byId["h1-rewrite"].status).toBe("planned");
    expect(byId["image-alt"].status).toBe("skipped");

    await approveAll(db, jobId);
    await advanceJob(jobId, ports, "user-1");
    const commit = gh.commits[gh.commits.length - 1];
    const layout = commit.tree.find((t) => t.path === "src/layouts/Layout.astro")!.content;
    expect(layout).toContain('<meta name="description"');
    // shared layout → canonical built from each page's own path
    expect(layout).toContain('<link rel="canonical" href={new URL(Astro.url.pathname, "https://acme.test/")} />');
    expect(layout).toContain('<script type="application/ld+json" is:inline set:html={JSON.stringify(');
    expect(layout).toContain("const { title } = Astro.props;"); // frontmatter untouched
    const index = commit.tree.find((t) => t.path === "src/pages/index.astro")!.content;
    expect(index).toContain('<h1 class="hero">Fine widgets for teams that ship fast</h1>');
    expect(commit.tree.map((t) => t.path)).toContain("public/robots.txt");
  });
});
