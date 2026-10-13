import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/** GET /api/agent/guided/[id] — one guided fix list with its live-check status. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const { data: run } = await getServiceDb().from("guided_runs").select("*").eq("id", id).maybeSingle();
  if (!run || run.user_id !== auth.user.id) return ERR.notFound("guided fix list");
  return NextResponse.json({ run });
}
