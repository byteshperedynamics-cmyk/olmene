/**
 * Shared-secret check for the cron routes (/api/cron/*). The secret is
 * OLMENE_CRON_SECRET on the Worker if set, otherwise the `cron_secret` already
 * in Supabase Vault (the one pg_cron sends), read with the service role — so
 * schedules work without copying a secret by hand.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";
import { safeEqual } from "./sync";

let vaultSecretCache: { value: string | null; at: number } | null = null;

export async function cronSecret(db: SupabaseClient): Promise<string | null> {
  const env = getEnv("OLMENE_CRON_SECRET");
  if (env && env.length >= 32) return env;
  if (vaultSecretCache && Date.now() - vaultSecretCache.at < 5 * 60_000) return vaultSecretCache.value;
  const { data, error } = await db.rpc("vault_secret", { p_name: "cron_secret" });
  const value = !error && typeof data === "string" && data.length >= 32 && !data.startsWith("REPLACE_") ? data : null;
  vaultSecretCache = { value, at: Date.now() };
  return value;
}

/** null when authorized, otherwise the error response to return. */
export async function requireCron(req: Request, db: SupabaseClient): Promise<NextResponse | null> {
  const secret = await cronSecret(db).catch(() => null);
  if (!secret) {
    return NextResponse.json({ error: { code: "cron_disabled", message: "Cron secret not configured." } }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  return null;
}
