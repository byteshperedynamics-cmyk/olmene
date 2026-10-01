import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled, appUrl, githubWebBase } from "@/lib/agent/env";
import { ERR, randomState, requireAgentAdmin } from "@/lib/agent/http";
import { agentLog } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/github/register
 * Starts the GitHub App manifest flow: creates a state row bound to the
 * caller, then returns the GitHub "new app" URL with the manifest pre-filled
 * (Contents + Pull requests write only). The browser navigates there.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  // Owner only: whoever registers the app controls what every customer installs.
  const auth = await requireAgentAdmin(req);
  if ("error" in auth) return auth.error;
  const db = getServiceDb();

  const manifest = {
    name: "Olmene",
    url: appUrl(),
    redirect_url: appUrl() + "/api/agent/github/manifest-callback/",
    callback_urls: [appUrl() + "/api/agent/github/callback/"],
    setup_url: appUrl() + "/app/agent/install",
    public: false,
    default_events: [] as string[],
    default_permissions: { contents: "write", pull_requests: "write" },
  };

  // One-click registration must not clobber an existing configured app.
  const { data: existing } = await db.from("agent_app_config").select("name").eq("provider", "github").limit(1);
  if (existing && existing.length > 0) {
    const { count } = await db.from("connections").select("id", { count: "exact", head: true }).eq("provider", "github");
    if ((count ?? 0) > 0) {
      return ERR.badRequest("A GitHub App is already registered and in use. Contact support to replace it.");
    }
  }

  const state = randomState();
  const { error } = await db.from("agent_oauth_states").insert({
    user_id: auth.user.id,
    flow: "github-manifest",
    state,
    payload: {},
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // GitHub code is valid 1 hour
  });
  if (error) {
    agentLog("error", "state insert failed", { detail: error.message });
    return NextResponse.json({ error: { code: "internal", message: "Could not start registration." } }, { status: 500 });
  }

  const url = `${githubWebBase()}/settings/apps/new?state=${state}&manifest=${encodeURIComponent(JSON.stringify(manifest))}`;
  return NextResponse.json({ url });
}
