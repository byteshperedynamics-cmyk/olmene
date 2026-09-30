import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { encryptSecret, masterKeyFromEnv } from "@/lib/agent/crypto";
import { AgentConfigError, agentEnabled, appUrl, getEnv } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { agentLog } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/github/manifest-callback?code=&state=
 * End of the GitHub App manifest flow. Exchanges the one-time code for the
 * app's credentials (incl. private key PEM), stores them envelope-encrypted,
 * and redirects the operator back to the Agent page.
 *
 * Security: the state row must exist, be unconsumed, belong to a Olmene
 * user, and be < 1 h old. The code is exchanged exactly once.
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(appUrl() + "/app/agent/?registered=0&reason=missing_params");
  }

  const db = getServiceDb();
  const { data: stateRow } = await db
    .from("agent_oauth_states")
    .select("id, user_id, consumed_at, expires_at")
    .eq("state", state)
    .eq("flow", "github-manifest")
    .maybeSingle();
  if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at) < new Date()) {
    return NextResponse.redirect(appUrl() + "/app/agent/?registered=0&reason=bad_state");
  }

  try {
    const masterKey = await masterKeyFromEnv(requireKey());
    const res = await fetch("https://api.github.com/app-manifests/" + encodeURIComponent(code) + "/conversions", {
      method: "POST",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      agentLog("error", "manifest conversion failed", { status: res.status });
      return NextResponse.redirect(appUrl() + "/app/agent/?registered=0&reason=conversion_failed");
    }
    const app = (await res.json()) as {
      id: number;
      slug: string;
      client_id: string;
      client_secret: string;
      webhook_secret?: string | null;
      pem: string;
      html_url: string;
    };

    const encSecret = await encryptSecret(masterKey, app.client_secret);
    const encPem = await encryptSecret(masterKey, app.pem);

    const meta = { app_slug: app.slug, html_url: app.html_url, created_via: "manifest", registered_at: new Date().toISOString() };
    const { error: upsertError } = await db.from("agent_app_config").upsert(
      [
        { provider: "github", name: "app_id", is_secret: false, value_text: String(app.id), metadata: meta },
        { provider: "github", name: "client_id", is_secret: false, value_text: app.client_id, metadata: meta },
        { provider: "github", name: "client_secret", is_secret: true, value_ciphertext: encSecret },
        { provider: "github", name: "private_key", is_secret: true, value_ciphertext: encPem },
      ].map((r) => ({ ...r, value_dek_ciphertext: null })),
      { onConflict: "provider,name" },
    );
    if (upsertError) throw new Error(upsertError.message);

    await db.from("agent_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stateRow.id);
    await db.from("agent_actions").insert({
      user_id: stateRow.user_id,
      actor: "user",
      action_type: "config",
      provider: "github",
      result: "success",
      target: { app: app.slug, appId: app.id },
      detail: { via: "manifest-flow" },
    });
    return NextResponse.redirect(appUrl() + "/app/agent/?registered=1");
  } catch (e) {
    agentLog("error", "manifest callback error", {
      detail: e instanceof AgentConfigError ? e.message : "internal",
    });
    return NextResponse.redirect(appUrl() + "/app/agent/?registered=0&reason=internal");
  }
}

function requireKey(): string {
  const k = getEnv("MW_KMS_MASTER_KEY");
  if (!k) throw new AgentConfigError("MW_KMS_MASTER_KEY missing");
  return k;
}
