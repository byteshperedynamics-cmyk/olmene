import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled, appUrl, githubWebBase } from "@/lib/agent/env";
import { ERR, randomState, requireUser } from "@/lib/agent/http";
import { loadGithubAppConfig } from "@/lib/agent/github/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/connect/github
 * Returns the GitHub authorize URL (user-to-server web flow, zero user
 * scopes). If the app is not installed yet, GitHub's authorize page offers
 * "Install & Authorize" in one step. The state nonce binds the round-trip to
 * this Olmene user — installation_id values from anywhere else are never
 * trusted (GitHub docs spoof warning, see docs/integrations.md §1.2).
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const db = getServiceDb();
  const app = await loadGithubAppConfig(db);
  if (!app) return ERR.notConfigured();

  const state = randomState();
  const { error } = await db.from("agent_oauth_states").insert({
    user_id: auth.user.id,
    flow: "github-connect",
    state,
    payload: {},
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: { code: "internal", message: "Could not start the connect flow." } }, { status: 500 });
  }

  const redirectUri = `${appUrl()}/api/agent/github/callback/`;
  const url = `${githubWebBase()}/login/oauth/authorize?client_id=${encodeURIComponent(app.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  return NextResponse.json({ url });
}
