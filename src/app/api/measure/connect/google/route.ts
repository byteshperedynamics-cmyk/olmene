import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { appUrl } from "@/lib/agent/env";
import { randomState } from "@/lib/agent/http";
import { authUrl, googleClient, measureEnabled } from "@/lib/measure/google";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/measure/connect/google/ — returns the Google consent URL for
 * read-only Search Console access. A state nonce binds the round-trip to this
 * Olmene user (10-minute expiry, single use).
 */
export async function POST(req: Request) {
  if (!measureEnabled()) {
    return NextResponse.json({ error: { code: "measure_disabled", message: "Measuring is not enabled yet." } }, { status: 503 });
  }
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  const client = googleClient();
  if (!client) {
    return NextResponse.json({ error: { code: "not_configured", message: "Search Console connection is not configured yet." } }, { status: 503 });
  }
  const db = getServiceDb();
  const state = randomState();
  const { error } = await db.from("agent_oauth_states").insert({
    user_id: actor.ownerId,
    flow: "google-gsc",
    state,
    payload: {},
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: { code: "internal", message: "Could not start connecting Search Console." } }, { status: 500 });
  }
  return NextResponse.json({ url: authUrl(client.id, `${appUrl()}/api/measure/google/callback/`, state) });
}
