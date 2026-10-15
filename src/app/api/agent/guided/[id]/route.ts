import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** GET /api/agent/guided/[id] — one guided fix list with its live-check status. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  const { data: run } = await getServiceDb().from("guided_runs").select("*").eq("id", id).maybeSingle();
  if (!run || run.user_id !== actor.ownerId) return ERR.notFound("guided fix list");
  return NextResponse.json({ run });
}
