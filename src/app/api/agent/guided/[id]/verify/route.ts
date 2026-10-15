import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError } from "@/lib/agent/http";
import { verifyGuidedRun, type GuidedRunRow } from "@/lib/agent/guided/service";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 20_000;

/** POST /api/agent/guided/[id]/verify — "I've made the changes": check the live site now. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  const db = getServiceDb();
  const { data: run } = await db.from("guided_runs").select("*").eq("id", id).maybeSingle();
  if (!run || run.user_id !== actor.ownerId) return ERR.notFound("guided fix list");
  if (run.last_checked_at && Date.now() - new Date(run.last_checked_at).getTime() < MIN_INTERVAL_MS) {
    return jsonError(429, "rate_limited", "Checked a moment ago. Give your site a few seconds to publish, then try again.");
  }
  const updated = await verifyGuidedRun(db, fetch, run as GuidedRunRow);
  return NextResponse.json({ run: updated });
}
