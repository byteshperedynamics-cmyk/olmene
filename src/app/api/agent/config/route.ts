import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { loadGithubAppConfig } from "@/lib/agent/github/client";
import { readFlags } from "@/lib/agent/audit";
import { checkApplyEntitlement } from "@/lib/agent/entitlement";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/config — status endpoint for the Agent UI:
 * feature flag, GitHub App registration state, connection, quota, kill switch.
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const db = getServiceDb();
  const [app, flags] = await Promise.all([loadGithubAppConfig(db), readFlags(db)]);

  const { data: connections } = await db
    .from("connections")
    .select("id, provider, status, provider_account_id, external_installation_id, resource_ids, created_at, last_verified_at")
    .eq("user_id", auth.user.id)
    .eq("provider", "github")
    .order("created_at", { ascending: false });

  const entitlement = await checkApplyEntitlement(db, auth.user.id);

  return NextResponse.json({
    enabled: true,
    killSwitch: flags.globalKillSwitch || !flags.providerGithubEnabled,
    github: {
      configured: Boolean(app),
      appSlug: app?.appSlug ?? null,
      connections: (connections ?? []).map((c: Record<string, unknown>) => ({
        id: c.id,
        status: c.status,
        account: c.provider_account_id,
        installationId: c.external_installation_id,
        repos: c.resource_ids,
        createdAt: c.created_at,
        lastVerifiedAt: c.last_verified_at,
      })),
    },
    entitlement,
  });
}
