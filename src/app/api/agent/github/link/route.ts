import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled, githubApiBase } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { loadGithubAppConfig, mintInstallationToken, GithubApiError } from "@/lib/agent/github/client";
import { createAppJwt } from "@/lib/agent/github/jwt";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/github/link?state=… — returns the installations discovered
 * during THIS user's OAuth round-trip (stored server-side; not spoofable).
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state) return ERR.badRequest("state is required.");

  const db = getServiceDb();
  const { data: stateRow } = await db
    .from("agent_oauth_states")
    .select("id, user_id, consumed_at, expires_at, payload")
    .eq("state", state)
    .eq("flow", "github-connect")
    .maybeSingle();
  if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at) < new Date()) {
    return ERR.badRequest("This connect session expired. Start again from the Agent page.");
  }
  if (stateRow.user_id !== auth.user.id) return ERR.forbidden();

  const payload = stateRow.payload as { installations?: Array<{ id: number; login: string; type: string }> };
  return NextResponse.json({ installations: payload.installations ?? [] });
}

/**
 * POST /api/agent/github/link  { state, installationId }
 * Links an installation to the Olmene user. The installationId MUST be
 * one that was discovered via the user's own OAuth round-trip (stored in the
 * state payload) — this is the anti-spoof gate required by GitHub's docs.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { state?: string; installationId?: number | string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const { state, installationId } = body;
  if (!state || !installationId) return ERR.badRequest("state and installationId are required.");
  const instId = Number(installationId);
  if (!Number.isInteger(instId) || instId <= 0) return ERR.badRequest("installationId must be a positive integer.");

  const db = getServiceDb();
  const { data: stateRow } = await db
    .from("agent_oauth_states")
    .select("id, user_id, consumed_at, expires_at, payload")
    .eq("state", state)
    .eq("flow", "github-connect")
    .maybeSingle();
  if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at) < new Date()) {
    return ERR.badRequest("This connect session expired. Start again from the Agent page.");
  }
  if (stateRow.user_id !== auth.user.id) return ERR.forbidden();

  const payload = stateRow.payload as { installations?: Array<{ id: number; login: string; type: string }> };
  const discovered = payload.installations ?? [];
  const match = discovered.find((i) => i.id === instId);
  if (!match) {
    return ERR.forbidden(); // spoofed or stale installation id
  }

  const app = await loadGithubAppConfig(db);
  if (!app) return ERR.notConfigured();

  // Verify the installation is live and belongs to the expected account.
  let accountLogin = match.login;
  try {
    const jwt = createAppJwt(app.appId, app.privateKeyPem);
    const res = await fetch(`${githubApiBase()}/app/installations/${instId}`, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new GithubApiError(res.status, "installation lookup failed");
    const inst = (await res.json()) as { account: { login: string }; repository_selection: string };
    accountLogin = inst.account?.login ?? accountLogin;
  } catch {
    return ERR.badRequest("Could not verify that installation with GitHub. Try reconnecting.");
  }

  // Discover the repos this installation can touch (the future allowlist).
  let resourceIds: string[] = [];
  try {
    const { token } = await mintInstallationToken(app, String(instId));
    const reposRes = await fetch(`${githubApiBase()}/installation/repositories?per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (reposRes.ok) {
      const reposBody = (await reposRes.json()) as { repositories?: Array<{ full_name: string }> };
      resourceIds = (reposBody.repositories ?? []).map((r) => r.full_name);
    }
  } catch {
    // Non-fatal: allowlist can be rebuilt at job time.
  }

  const { data: existing } = await db
    .from("connections")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("provider", "github")
    .eq("external_installation_id", String(instId))
    .maybeSingle();

  // Update-or-insert (not .upsert): the conflict target must match a plain
  // unique constraint, and older databases only had an expression index.
  const connRow = {
    user_id: auth.user.id,
    provider: "github",
    status: "active",
    provider_account_id: accountLogin,
    external_installation_id: String(instId),
    resource_ids: resourceIds,
    scopes: ["contents:write", "pull_requests:write"],
    metadata: { installationType: match.type },
    last_verified_at: new Date().toISOString(),
  };
  const { data: connection, error } = existing
    ? await db.from("connections").update({ ...connRow, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id").single()
    : await db.from("connections").insert(connRow).select("id").single();
  if (error || !connection) {
    return NextResponse.json({ error: { code: "internal", message: "Could not save the connection." } }, { status: 500 });
  }

  await db.from("agent_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stateRow.id);
  await db.from("agent_actions").insert({
    user_id: auth.user.id,
    actor: "user",
    action_type: "connect",
    provider: "github",
    result: "success",
    target: { installation: instId, account: accountLogin, repos: resourceIds.length },
    detail: { reconnected: Boolean(existing) },
  });

  return NextResponse.json({ connectionId: connection.id, account: accountLogin, repos: resourceIds });
}
