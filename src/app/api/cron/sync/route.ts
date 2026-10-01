import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { getEnv } from "@/lib/agent/env";
import { makeGithubPort } from "@/lib/agent/github/port";
import { safeEqual, syncPullStates, type SyncDbPort } from "@/lib/agent/sync";
import type { AgentJobRow } from "@/lib/agent/runner";
import { agentLog } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/sync/ — periodic background work (brief §6.3/§6.4).
 * Today: PR merge tracking. Called by pg_cron via pg_net with the shared
 * secret in `x-cron-secret` (OLMENE_CRON_SECRET on the Worker, the same value
 * in Supabase Vault). Without the secret configured the route is disabled.
 */
export async function POST(req: Request) {
  const secret = getEnv("OLMENE_CRON_SECRET");
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: { code: "cron_disabled", message: "Cron secret not configured." } }, { status: 503 });
  }
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(given, secret)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  const db = getServiceDb();
  const port: SyncDbPort = {
    async listOpenPrJobs(limit) {
      const { data } = await db
        .from("agent_jobs")
        .select("id, user_id, report_id, connection_id, provider, status, current_step, input, step_outputs, error, wait_reason, locked_until, attempts, pr_number, pr_url, pr_state")
        .eq("pr_state", "open")
        .order("pr_last_polled_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      return (data as AgentJobRow[] | null) ?? [];
    },
    async updateJob(jobId, patch) {
      await db.from("agent_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
    },
    async audit(entry) {
      const { writeAudit } = await import("@/lib/agent/audit");
      await writeAudit(db, entry);
    },
  };

  try {
    const prs = await syncPullStates(port, makeGithubPort(db));
    return NextResponse.json({ ok: true, prs });
  } catch (e) {
    agentLog("error", "cron sync failed", { detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    return NextResponse.json({ error: { code: "sync_failed" } }, { status: 500 });
  }
}
