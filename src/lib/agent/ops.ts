/**
 * Operational event log (public.ops_events) — the place to look first during
 * an incident. Server-side only (service role); secrets are redacted and a
 * failed insert never breaks the request that was reporting the problem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { redactJson, redactString } from "./redact";

export type OpsSeverity = "error" | "warn" | "info";

export async function recordOpsEvent(
  db: SupabaseClient,
  source: string,
  message: string,
  detail: Record<string, unknown> = {},
  severity: OpsSeverity = "error",
): Promise<void> {
  try {
    await db.from("ops_events").insert({
      source,
      severity,
      message: redactString(message).slice(0, 500),
      detail: redactJson(detail),
    });
  } catch {
    /* logging must never take the caller down */
  }
}
