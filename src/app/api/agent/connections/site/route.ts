import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/** GET /api/agent/connections/site — the user's Webflow / WordPress connections (no secrets). */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { data } = await getServiceDb().from("connections").select("id, provider, status, external_installation_id, metadata, last_verified_at, created_at")
    .eq("user_id", auth.user.id).in("provider", ["webflow", "wordpress"]).eq("status", "active").order("created_at", { ascending: false });
  return NextResponse.json({
    connections: (data ?? []).map((c) => ({ id: c.id, provider: c.provider, host: c.external_installation_id, metadata: c.metadata, lastVerifiedAt: c.last_verified_at, createdAt: c.created_at })),
  });
}
