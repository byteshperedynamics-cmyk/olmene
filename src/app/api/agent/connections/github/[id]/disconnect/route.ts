import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled, githubWebBase } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { evictInstallationTokens, loadGithubAppConfig, mintInstallationToken, GithubApiError } from "@/lib/agent/github/client";
import { agentLog } from "@/lib/agent/redact";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/connections/github/[id]/disconnect
 * Ends Olmene access: deletes the connection (we can no longer mint
 * tokens), then PROVES the credential is dead by attempting to mint one —
 * success means the app is still installed on GitHub (unverified, with exact
 * manual steps returned); 404/401 means dead. No unprovable revocation.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: connection } = await db
    .from("connections")
    .select("id, user_id, provider, status, provider_account_id, external_installation_id")
    .eq("id", id)
    .maybeSingle();
  if (!connection || connection.user_id !== actor.ownerId) return ERR.notFound("connection");
  if (connection.provider !== "github") return ERR.badRequest("Not a GitHub connection.");

  const installationId = connection.external_installation_id ?? "";

  // 1. Remove our ability to act immediately.
  const { error } = await db.from("connections").update({ status: "disconnected", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: { code: "internal", message: "Could not disconnect." } }, { status: 500 });
  }
  evictInstallationTokens(installationId);

  // 2. Attempt to prove the credential is dead.
  let verified = false;
  let evidence: Record<string, unknown>;
  const manualSteps = [
    "Open https://github.com/settings/installations",
    `Find "Olmene" and click Configure next to ${connection.provider_account_id ?? "your account"}`,
    "Click Uninstall — GitHub kills the app's access to your repositories immediately",
  ];
  try {
    const app = await loadGithubAppConfig(db);
    if (!app) {
      evidence = { checkedAt: new Date().toISOString(), note: "App credentials absent — nothing to mint with." };
      verified = true;
    } else {
      await mintInstallationToken(app, installationId);
      // Mint SUCCEEDED → the app is still installed on GitHub; only the user can uninstall.
      evidence = {
        checkedAt: new Date().toISOString(),
        attempt: "create installation access token",
        outcome: "token could still be created — the GitHub App is still installed on your GitHub account",
      };
    }
  } catch (e) {
    const status = e instanceof GithubApiError ? e.status : null;
    if (status === 404 || status === 401 || status === 403) {
      verified = true;
      evidence = {
        checkedAt: new Date().toISOString(),
        attempt: "create installation access token",
        outcome: `GitHub rejected the attempt (HTTP ${status}) — the credential is dead`,
        httpStatus: status,
      };
    } else {
      evidence = { checkedAt: new Date().toISOString(), outcome: "verification inconclusive (network error)" };
    }
  }

  await db.from("revocations").insert({
    connection_id: id,
    user_id: actor.ownerId,
    method: "connection_delete",
    verified,
    verification: evidence,
  });
  await db.from("agent_actions").insert({
    user_id: actor.ownerId,
    actor: "user",
    action_type: "disconnect",
    provider: "github",
    result: verified ? "success" : "failure",
    target: { installation: installationId, account: connection.provider_account_id },
    detail: { verified },
  });
  agentLog("info", "github disconnected", { verified, installation: installationId });

  return NextResponse.json({
    verified,
    evidence,
    manualSteps: verified ? [] : manualSteps,
    uninstallUrl: `${githubWebBase()}/settings/installations`,
  });
}
