import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { loadGithubAppConfig, mintInstallationToken, ScopedGithubClient, GithubApiError } from "@/lib/agent/github/client";
import { createLlmPort } from "@/lib/agent/llm";
import { advanceJob, type AgentJobRow, type GithubPort, type RunnerPorts } from "@/lib/agent/runner";
import { agentLog } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Production DB port on top of the service-role client. */
function makeDbPort(db: ReturnType<typeof getServiceDb>) {
  return {
    async getJob(jobId: string) {
      const { data } = await db
        .from("agent_jobs")
        .select(
          "id, user_id, report_id, connection_id, provider, status, current_step, input, step_outputs, error, wait_reason, locked_until, attempts, completed_at",
        )
        .eq("id", jobId)
        .maybeSingle();
      return (data as AgentJobRow | null) ?? null;
    },
    async updateJob(jobId: string, patch: Partial<AgentJobRow>) {
      await db.from("agent_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
    },
    async insertPlannedActions(jobId: string, rows: Array<Record<string, unknown>>) {
      const { error } = await db.from("planned_actions").insert(rows.map((r) => ({ ...r, agent_job_id: jobId })));
      if (error) throw new Error(`planned action insert failed: ${error.message}`);
    },
    async getPlannedActions(jobId: string) {
      const { data } = await db
        .from("planned_actions")
        .select("id, agent_job_id, fixer_id, finding_ref, action_class, target, preview, status, skip_reason, apply_result")
        .eq("agent_job_id", jobId);
      return (data as import("@/lib/agent/runner").PlannedActionRow[]) ?? [];
    },
    async updatePlannedAction(id: string, patch: Record<string, unknown>) {
      await db.from("planned_actions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async insertApproval(jobId: string, actionIds: string[], decision: "approved" | "rejected", userId: string, note?: string) {
      await db.from("approvals").insert({ agent_job_id: jobId, planned_action_ids: actionIds, decision, decided_by: userId, note: note ?? null });
    },
    async audit(entry: import("@/lib/agent/runner").AuditEntryInput) {
      const { writeAudit } = await import("@/lib/agent/audit");
      await writeAudit(db, entry);
    },
    async getReport(reportId: string) {
      const { data } = await db.from("reports").select("data").eq("id", reportId).maybeSingle();
      return ((data as { data?: import("@/lib/report-types").ReportData } | null)?.data ?? null) as import("@/lib/report-types").ReportData | null;
    },
    async getFlags() {
      const { readFlags } = await import("@/lib/agent/audit");
      return readFlags(db);
    },
    async insertReceipt(jobId: string, userId: string, content: string) {
      await db.from("receipts").insert({ agent_job_id: jobId, user_id: userId, format: "md", content });
    },
  };
}

/** Production GitHub port: mints a repo-narrowed installation token per job. */
function makeGithubPort(db: ReturnType<typeof getServiceDb>): GithubPort {
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

/**
 * POST /api/agent/jobs/[id]/advance — one unit of work per call.
 * The client drives the loop (same pattern as the report page's advance loop).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db
    .from("agent_jobs")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");
  if (["completed", "failed", "canceled", "killed"].includes(job.status)) {
    return NextResponse.json({ status: job.status, done: true });
  }

  const ports: RunnerPorts = {
    db: makeDbPort(db),
    gh: makeGithubPort(db),
    llm: createLlmPort(db),
  };

  try {
    const status = await advanceJob(id, ports, auth.user.id);
    return NextResponse.json({ status, done: ["completed", "failed", "canceled", "killed"].includes(status) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "advance failed";
    agentLog("error", "advance failed", { jobId: id, detail: msg.slice(0, 200) });
    return NextResponse.json(
      { error: { code: "advance_failed", message: "The step could not run. It will retry automatically." } },
      { status: 500 },
    );
  }
}
