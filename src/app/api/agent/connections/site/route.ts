import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** GET /api/agent/connections/site — the user's Webflow / WordPress connections (no secrets). */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { data } = await getServiceDb().from("connections").select("id, provider, status, external_installation_id, metadata, last_verified_at, created_at")
    .eq("user_id", actor.ownerId).in("provider", ["webflow", "wordpress"]).eq("status", "active").order("created_at", { ascending: false });
  return NextResponse.json({
    connections: (data ?? []).map((c) => ({ id: c.id, provider: c.provider, host: c.external_installation_id, metadata: c.metadata, lastVerifiedAt: c.last_verified_at, createdAt: c.created_at })),
  });
}
