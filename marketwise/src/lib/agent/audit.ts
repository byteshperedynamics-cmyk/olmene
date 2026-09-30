/**
 * Append-only audit log. Every agent-relevant event lands in `agent_actions`
 * with redacted detail. The table has no UPDATE/DELETE path from any role —
 * corrections are compensating rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { redactJson } from "./redact";

export type AuditActor = "agent" | "user" | "system";
export type AuditType =
  | "connect"
  | "disconnect"
  | "plan"
  | "preview"
  | "approve"
  | "reject"
  | "apply"
  | "verify"
  | "rollback"
  | "quota_block"
  | "kill_block"
  | "cancel"
  | "config";

export interface AuditEntry {
  agent_job_id?: string | null;
  planned_action_id?: string | null;
  user_id: string;
  actor: AuditActor;
  /** Stored as free text in the append-only log (validated upstream). */
  action_type: string;
  provider?: string | null;
  target?: Record<string, unknown> | null;
  result: "success" | "failure" | "blocked" | "skipped";
  before_hash?: string | null;
  after_hash?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function writeAudit(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  const row = {
    agent_job_id: entry.agent_job_id ?? null,
    planned_action_id: entry.planned_action_id ?? null,
    user_id: entry.user_id,
    actor: entry.actor,
    action_type: entry.action_type,
    provider: entry.provider ?? null,
    target: entry.target ? redactJson(entry.target) : null,
    result: entry.result,
    before_hash: entry.before_hash ?? null,
    after_hash: entry.after_hash ?? null,
    detail: entry.detail ? redactJson(entry.detail) : null,
  };
  const { error } = await db.from("agent_actions").insert(row);
  if (error) {
    // Audit failures must be loud — an unlogged write is a spec violation.
    throw new Error(`audit write failed: ${error.message}`);
  }
}

export interface AgentFlags {
  globalKillSwitch: boolean;
  providerGithubEnabled: boolean;
}

export async function readFlags(db: SupabaseClient): Promise<AgentFlags> {
  const { data, error } = await db.from("agent_flags").select("key, value").in("key", [
    "global_kill_switch",
    "provider_github_enabled",
  ]);
  if (error) throw new Error(`flag read failed: ${error.message}`);
  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  return {
    globalKillSwitch: map.get("global_kill_switch") === true,
    providerGithubEnabled: map.get("provider_github_enabled") !== false,
  };
}
