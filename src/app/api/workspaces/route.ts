import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { requireUser } from "@/lib/agent/http";
import { listMyWorkspaces } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** GET /api/workspaces/ — your own account plus every workspace you were invited to (the switcher). */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ workspaces: await listMyWorkspaces(getServiceDb(), auth.user) });
}
