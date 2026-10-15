import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { queueReportTest } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** POST /api/clients/[id]/report-test — email the signed-in person the client's report as recipients get it. Members and up. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  try {
    return NextResponse.json(await queueReportTest(getServiceDb(), r.actor, id), { status: 202 });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
