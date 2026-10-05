import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled, appUrl, githubApiBase, githubWebBase } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { loadGithubAppConfig } from "@/lib/agent/github/client";
import { agentLog } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";

interface InstallationLite {
  id: number;
  account: { login: string; type: string };
  repository_selection: string;
}

/**
 * GET /api/agent/github/callback?code=&state=
 * OAuth web-flow callback. Verifies state, exchanges the code for a
 * short-lived user access token (8 h — used ONCE, then discarded), lists the
 * installations that GitHub user actually has for our app, and stores them in
 * the state row. The user then links one of them from the install page.
 * No token is ever persisted.
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(appUrl() + "/app/agent/?connected=0&reason=missing_params");
  }

  const db = getServiceDb();
  const { data: stateRow } = await db
    .from("agent_oauth_states")
    .select("id, user_id, consumed_at, expires_at, payload")
    .eq("state", state)
    .eq("flow", "github-connect")
    .maybeSingle();
  if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at) < new Date()) {
    return NextResponse.redirect(appUrl() + "/app/agent/?connected=0&reason=bad_state");
  }

  const app = await loadGithubAppConfig(db);
  if (!app) {
    return NextResponse.redirect(appUrl() + "/app/agent/?connected=0&reason=app_not_configured");
  }

  try {
    // 1. code → user access token (single use, discarded at the end of this request)
    const tokenRes = await fetch(`${githubWebBase()}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        redirect_uri: appUrl() + "/api/agent/github/callback/",
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenBody.access_token || tokenBody.error) throw new Error("token exchange rejected");
    const userToken = tokenBody.access_token;

    // 2. Which installations does THIS GitHub user actually have?
    const instRes = await fetch(`${githubApiBase()}/user/installations`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!instRes.ok) throw new Error(`installation listing failed: ${instRes.status}`);
    const instBody = (await instRes.json()) as { installations?: InstallationLite[] };
    const installations = (instBody.installations ?? []).map((i) => ({
      id: i.id,
      login: i.account?.login ?? "unknown",
      type: i.account?.type ?? "User",
      selection: i.repository_selection,
    }));

    // 3. Persist the DISCOVERED installations (and nothing secret).
    await db
      .from("agent_oauth_states")
      .update({ payload: { installations }, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
      .eq("id", stateRow.id);

    // 4. Discard the user token — it exists nowhere else.
    agentLog("info", "github connect verified", { installations: installations.length });

    if (installations.length === 0) {
      return NextResponse.redirect(appUrl() + "/app/agent/?connected=0&reason=not_installed");
    }
    return NextResponse.redirect(appUrl() + `/app/agent/install?state=${state}`);
  } catch (e) {
    agentLog("error", "github callback failed", { detail: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
    return NextResponse.redirect(appUrl() + "/app/agent/?connected=0&reason=callback_failed");
  }
}
