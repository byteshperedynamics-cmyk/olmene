import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { getEnv } from "@/lib/agent/env";
import { makeGithubPort } from "@/lib/agent/github/port";
import { safeEqual, syncLiveChecks, syncPullStates, type LiveCheckDbPort, type SyncDbPort } from "@/lib/agent/sync";
import type { AppliedFix, LiveCheckState } from "@/lib/agent/live-check";
import type { AgentJobRow } from "@/lib/agent/runner";
import { agentLog } from "@/lib/agent/redact";
import { recordOpsEvent } from "@/lib/agent/ops";
import { decryptSecret, masterKeyFromEnv } from "@/lib/agent/crypto";
import { googleClient, measureEnabled } from "@/lib/measure/google";
import { syncMeasure, type MeasureDbPort } from "@/lib/measure/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/sync/ — periodic background work (brief §6.3/§6.4).
 * PR merge tracking, then (when Measure is enabled) Search Console sync and
 * outcome recomputation. Called by pg_cron via pg_net with the shared
 * secret in `x-cron-secret` (OLMENE_CRON_SECRET on the Worker, the same value
 * in Supabase Vault). Without the secret configured the route is disabled.
 */
/**
 * The cron secret: OLMENE_CRON_SECRET on the Worker if set, otherwise the
 * `cron_secret` already in Supabase Vault (the one pg_cron sends), read with
 * the service role — so the schedule works without copying a secret by hand.
 */
let vaultSecretCache: { value: string | null; at: number } | null = null;
async function cronSecret(db: ReturnType<typeof getServiceDb>): Promise<string | null> {
  const env = getEnv("OLMENE_CRON_SECRET");
  if (env && env.length >= 32) return env;
  if (vaultSecretCache && Date.now() - vaultSecretCache.at < 5 * 60_000) return vaultSecretCache.value;
  const { data, error } = await db.rpc("vault_secret", { p_name: "cron_secret" });
  const value = !error && typeof data === "string" && data.length >= 32 && !data.startsWith("REPLACE_") ? data : null;
  vaultSecretCache = { value, at: Date.now() };
  return value;
}

export async function POST(req: Request) {
  const db = getServiceDb();
  const secret = await cronSecret(db).catch(() => null);
  if (!secret) {
    return NextResponse.json({ error: { code: "cron_disabled", message: "Cron secret not configured." } }, { status: 503 });
  }
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(given, secret)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

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
    // After merges are recorded: confirm merged fixes are live, then weekly.
    const live = await syncLiveChecks(liveCheckPort(db), (input, init) => fetch(input, init));
    let measure: Awaited<ReturnType<typeof syncMeasure>> | null = null;
    const gclient = googleClient();
    const key = getEnv("MW_KMS_MASTER_KEY");
    if (measureEnabled() && gclient && key) {
      const masterKey = await masterKeyFromEnv(key);
      measure = await syncMeasure(measurePort(db), {
        client: gclient,
        decrypt: (ct) => decryptSecret(masterKey, ct),
      });
    }
    return NextResponse.json({ ok: true, prs, live, measure });
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    agentLog("error", "cron sync failed", { detail });
    await recordOpsEvent(db, "cron-sync", "cron sync failed", { detail });
    return NextResponse.json({ error: { code: "sync_failed" } }, { status: 500 });
  }
}

function measurePort(db: ReturnType<typeof getServiceDb>): MeasureDbPort {
  return {
    async listGoogleConnections() {
      const { data } = await db
        .from("connections")
        .select("id, user_id, secret_ciphertext, metadata")
        .eq("provider", "google")
        .eq("status", "active");
      return (data as Awaited<ReturnType<MeasureDbPort["listGoogleConnections"]>> | null) ?? [];
    },
    async lastFetchedDate(connectionId) {
      const { data } = await db
        .from("gsc_daily")
        .select("date")
        .eq("connection_id", connectionId)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.date as string | undefined) ?? null;
    },
    async upsertDaily(rows) {
      const { error } = await db.from("gsc_daily").upsert(
        rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
        { onConflict: "connection_id,date" },
      );
      if (error) throw new Error(error.message);
    },
    async getDaily(connectionId, since) {
      const { data } = await db
        .from("gsc_daily")
        .select("date, clicks")
        .eq("connection_id", connectionId)
        .gte("date", since)
        .order("date");
      return (data as Array<{ date: string; clicks: number }> | null) ?? [];
    },
    async mergedJobs(userId) {
      const { data } = await db
        .from("agent_jobs")
        .select("id, merged_at")
        .eq("user_id", userId)
        .eq("pr_state", "merged")
        .not("merged_at", "is", null);
      return (data as Array<{ id: string; merged_at: string }> | null) ?? [];
    },
    async replaceOutcomes(connectionId, userId, outcomes) {
      await db.from("fix_outcomes").delete().eq("connection_id", connectionId);
      if (!outcomes.length) return;
      const { error } = await db.from("fix_outcomes").insert(
        outcomes.map((o) => ({
          user_id: userId,
          connection_id: connectionId,
          agent_job_ids: o.ids,
          merge_date: o.mergeDate,
          status: o.status,
          before_mean: o.beforeMean,
          after_mean: o.afterMean,
          delta: o.delta,
          delta_pct: o.deltaPct,
          p_value: o.pValue,
          confidence: o.confidence,
          before_days: o.beforeDays,
          after_days: o.afterDays,
        })),
      );
      if (error) throw new Error(error.message);
    },
    async markConnection(id, patch) {
      await db.from("connections").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    },
  };
}


function liveCheckPort(db: ReturnType<typeof getServiceDb>): LiveCheckDbPort {
  return {
    async listMergedJobs(limit) {
      const { data } = await db
        .from("agent_jobs")
        .select("id, user_id, report_id, connection_id, provider, status, current_step, input, step_outputs, error, wait_reason, locked_until, attempts, pr_number, pr_url, pr_state, merged_at")
        .eq("pr_state", "merged")
        .not("merged_at", "is", null)
        .order("merged_at", { ascending: false })
        .limit(limit);
      return (data as AgentJobRow[] | null) ?? [];
    },
    async getAppliedFixes(jobId) {
      const { data } = await db
        .from("planned_actions")
        .select("fixer_id, preview")
        .eq("agent_job_id", jobId)
        .eq("status", "applied");
      return (data as AppliedFix[] | null) ?? [];
    },
    async getSiteUrl(job) {
      if (!job.report_id) return null;
      const { data } = await db.from("reports").select("data").eq("id", job.report_id).maybeSingle();
      const site = (data?.data as { meta?: { siteUrl?: string } } | undefined)?.meta?.siteUrl;
      return typeof site === "string" && /^https?:\/\//.test(site) ? site : null;
    },
    async saveLiveCheck(job, state: LiveCheckState) {
      await db
        .from("agent_jobs")
        .update({ step_outputs: { ...job.step_outputs, liveCheck: state }, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    },
    async audit(entry) {
      const { writeAudit } = await import("@/lib/agent/audit");
      await writeAudit(db, entry);
    },
  };
}
