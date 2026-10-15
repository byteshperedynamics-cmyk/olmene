import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { jsonError, requireUser } from "@/lib/agent/http";
import { acceptInvite, isInviteToken, previewInvite, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "invite_not_found", "This invitation link isn't valid. Ask for a new one.");

/** GET /api/invites/?t=<token> — what an invitation is for (works signed out, so the page can say who invited you). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  if (!isInviteToken(token)) return notFound();
  const invite = await previewInvite(getServiceDb(), token);
  if (!invite) return notFound();
  return NextResponse.json({ invite }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

/** POST /api/invites/ { token } — accept as the signed-in person; returns the workspace to switch to. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  if (!isInviteToken(body?.token)) return notFound();
  try {
    return NextResponse.json({ workspace: await acceptInvite(getServiceDb(), auth.user, body.token) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
