/**
 * Production AgentDbPort on top of the service-role client. Shared by every
 * route that drives fix runs: the user's advance calls, the approve kick and
 * the cron driver (/api/cron/agent/), so they all claim jobs the same way.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDbPort, AgentJobRow, AuditEntryInput, PlannedActionRow } from "./runner";
import type { ReportData } from "@/lib/report-types";

export const AGENT_JOB_COLUMNS =
  "id, user_id, report_id, scan_id, connection_id, provider, status, current_step, input, step_outputs, error, wait_reason, locked_until, attempts, completed_at";

export function makeDbPort(db: SupabaseClient): AgentDbPort {
  return {
    async getJob(jobId) {
      const { data } = await db.from("agent_jobs").select(AGENT_JOB_COLUMNS).eq("id", jobId).maybeSingle();
      return (data as AgentJobRow | null) ?? null;
    },
    async claimJob(jobId, leaseUntil, now, attempts) {
      // Atomic lease: the row is only taken when nobody holds an unexpired
      // lease, so two drivers (a tab, the cron, the approve kick) never run
      // the same step at once.
      const { data, error } = await db
        .from("agent_jobs")
        .update({ locked_until: leaseUntil, attempts, updated_at: now })
        .eq("id", jobId)
        .or(`locked_until.is.null,locked_until.lt.${now}`)
        .select("id");
      if (error) throw new Error(`job claim failed: ${error.message}`);
      return (data ?? []).length === 1;
    },
    async updateJob(jobId, patch) {
      await db.from("agent_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
    },
    async insertPlannedActions(jobId, rows) {
      const { error } = await db.from("planned_actions").insert(rows.map((r) => ({ ...r, agent_job_id: jobId })));
      if (error) throw new Error(`planned action insert failed: ${error.message}`);
    },
    async getPlannedActions(jobId) {
      const { data } = await db
        .from("planned_actions")
        .select("id, agent_job_id, fixer_id, finding_ref, action_class, target, preview, status, skip_reason, apply_result")
        .eq("agent_job_id", jobId);
      return (data as PlannedActionRow[] | null) ?? [];
    },
    async updatePlannedAction(id, patch) {
      await db.from("planned_actions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async insertApproval(jobId, actionIds, decision, userId, note) {
      await db.from("approvals").insert({ agent_job_id: jobId, planned_action_ids: actionIds, decision, decided_by: userId, note: note ?? null });
    },
    async audit(entry: AuditEntryInput) {
      const { writeAudit } = await import("./audit");
      await writeAudit(db, entry);
    },
    async getReport(reportId) {
      const { data } = await db.from("reports").select("data").eq("id", reportId).maybeSingle();
      return ((data as { data?: ReportData } | null)?.data ?? null) as ReportData | null;
    },
    async getReportForJob(job) {
      if (job.report_id) return this.getReport(job.report_id);
      if (!job.scan_id) return null;
      // Free preview runs plan from a saved scan instead of a full report.
      const { liteReportFromScan } = await import("./lite-report");
      const { data } = await db.from("scans").select("id, site_url, result, page_text, profile").eq("id", job.scan_id).maybeSingle();
      return data ? liteReportFromScan(data as Parameters<typeof liteReportFromScan>[0]) : null;
    },
    async getFlags() {
      const { readFlags } = await import("./audit");
      return readFlags(db);
    },
    async insertReceipt(jobId, userId, content) {
      await db.from("receipts").insert({ agent_job_id: jobId, user_id: userId, format: "md", content });
    },
    async notify(userId, kind, payload, dedupeKey) {
      const { enqueueNotification } = await import("@/lib/notify");
      await enqueueNotification(db, { userId, kind, payload, dedupeKey });
    },
  };
}
