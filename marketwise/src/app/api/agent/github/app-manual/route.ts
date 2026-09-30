import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { encryptSecret, masterKeyFromEnv } from "@/lib/agent/crypto";
import { AgentConfigError, agentEnabled, getEnv } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/github/app-manual  { appId, privateKey, clientId, clientSecret }
 * Manual fallback for registering the GitHub App (paste credentials from
 * GitHub → Settings → Developer settings → GitHub Apps). Stores secrets
 * envelope-encrypted, identical to the manifest flow.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { appId?: string; privateKey?: string; clientId?: string; clientSecret?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const { appId, privateKey, clientId, clientSecret } = body;
  if (!appId || !privateKey || !clientId || !clientSecret) {
    return ERR.badRequest("appId, privateKey, clientId and clientSecret are all required.");
  }
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
    return ERR.badRequest("privateKey must be a PEM block (GitHub App private key).");
  }

  const db = getServiceDb();
  const { count } = await db.from("connections").select("id", { count: "exact", head: true }).eq("provider", "github");
  if ((count ?? 0) > 0) {
    return ERR.badRequest("A GitHub App is already registered and in use. Contact support to replace it.");
  }

  try {
    const masterKey = await masterKeyFromEnv(requireKey());
    const meta = { created_via: "manual", registered_at: new Date().toISOString() };
    const { error } = await db.from("agent_app_config").upsert(
      [
        { provider: "github", name: "app_id", is_secret: false, value_text: String(appId).trim(), metadata: meta },
        { provider: "github", name: "client_id", is_secret: false, value_text: String(clientId).trim(), metadata: meta },
        { provider: "github", name: "client_secret", is_secret: true, value_ciphertext: await encryptSecret(masterKey, clientSecret) },
        { provider: "github", name: "private_key", is_secret: true, value_ciphertext: await encryptSecret(masterKey, privateKey) },
      ],
      { onConflict: "provider,name" },
    );
    if (error) throw new Error(error.message);
    await db.from("agent_actions").insert({
      user_id: auth.user.id,
      actor: "user",
      action_type: "config",
      provider: "github",
      result: "success",
      target: { appId: String(appId).trim() },
      detail: { via: "manual" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AgentConfigError) return ERR.notConfigured();
    return NextResponse.json(
      { error: { code: "internal", message: "Could not store the app credentials." } },
      { status: 500 },
    );
  }
}

function requireKey(): string {
  const k = getEnv("MW_KMS_MASTER_KEY");
  if (!k) throw new AgentConfigError("MW_KMS_MASTER_KEY missing");
  return k;
}
