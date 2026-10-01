import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { appUrl, getEnv } from "@/lib/agent/env";
import { encryptSecret, masterKeyFromEnv } from "@/lib/agent/crypto";
import { agentLog } from "@/lib/agent/redact";
import { exchangeCode, googleClient, listSites, measureEnabled, pickProperty, GSC_SCOPE } from "@/lib/measure/google";

export const dynamic = "force-dynamic";

const back = (q: string) => NextResponse.redirect(`${appUrl()}/app/impact/?${q}`);

/**
 * GET /api/measure/google/callback/?code=&state=
 * Verifies and consumes the state nonce, exchanges the code (offline access),
 * matches a Search Console property to the user's analyzed site, and stores
 * the refresh token envelope-encrypted. The access token is discarded.
 */
export async function GET(req: Request) {
  if (!measureEnabled()) return back("connected=0&reason=disabled");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("connected=0&reason=denied");
  if (!code || !state) return back("connected=0&reason=missing_params");

  const db = getServiceDb();
  // Consume the nonce atomically: only an unconsumed, unexpired row matches.
  const { data: consumed } = await db
    .from("agent_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .eq("flow", "google-gsc")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (!consumed) return back("connected=0&reason=bad_state");
  const userId = consumed.user_id as string;

  const client = googleClient();
  const keyValue = getEnv("MW_KMS_MASTER_KEY");
  if (!client || !keyValue) return back("connected=0&reason=not_configured");

  try {
    const tokens = await exchangeCode(client, code, `${appUrl()}/api/measure/google/callback/`);
    const sites = await listSites(tokens.accessToken);

    const { data: lastJob } = await db
      .from("analysis_jobs")
      .select("site_url")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const property = lastJob?.site_url ? pickProperty(sites, lastJob.site_url as string) : null;
    if (!property) return back(`connected=0&reason=no_property&count=${sites.length}`);

    const masterKey = await masterKeyFromEnv(keyValue);
    const ciphertext = await encryptSecret(masterKey, tokens.refreshToken);
    const row = {
      user_id: userId,
      provider: "google",
      status: "active",
      provider_account_id: property,
      external_installation_id: property,
      scopes: [GSC_SCOPE],
      metadata: { property, site: lastJob?.site_url ?? null, properties: sites.map((s) => s.siteUrl).slice(0, 50) },
      secret_ciphertext: ciphertext,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // One active Google connection per user: retire older ones first.
    await db.from("connections").update({ status: "disconnected" }).eq("user_id", userId).eq("provider", "google").neq("external_installation_id", property);
    // The unique index is on an expression (coalesce), so no ON CONFLICT
    // target exists: select, then update or insert.
    const { data: existing } = await db
      .from("connections")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("external_installation_id", property)
      .maybeSingle();
    const { error } = existing
      ? await db.from("connections").update(row).eq("id", existing.id)
      : await db.from("connections").insert(row);
    if (error) throw new Error(`connection save failed: ${error.message}`);
    return back("connected=1");
  } catch (e) {
    agentLog("error", "gsc connect failed", { detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    return back("connected=0&reason=exchange_failed");
  }
}
