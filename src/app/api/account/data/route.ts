import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { recordOpsEvent } from "@/lib/agent/ops";
import { busyWith, deleteUserData, exportUserData } from "@/lib/account/server";

export const dynamic = "force-dynamic";

/** GET /api/account/data/ — everything Olmene keeps about you, as a JSON download. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const data = await exportUserData(getServiceDb(), auth.user.id, auth.user.email);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="olmene-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * DELETE /api/account/data/ { confirm: "delete" } — removes reports, sites,
 * scans, activity and progress links; keeps the account, plan and
 * connections (account/server.ts deleteUserData has the full list).
 */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (typeof body?.confirm !== "string" || body.confirm.trim().toLowerCase() !== "delete") {
    return ERR.badRequest('Type "delete" to confirm.');
  }
  const db = getServiceDb();
  const busy = await busyWith(db, auth.user.id);
  if (busy) {
    return jsonError(
      409,
      "busy",
      busy === "analysis" ? "An analysis is still running. Wait for it to finish, then try again." : "A fix run is still in progress. Wait for it to finish, then try again.",
    );
  }
  try {
    await deleteUserData(db, auth.user.id);
  } catch (e) {
    await recordOpsEvent(db, "account", "data deletion failed", { error: e instanceof Error ? e.message : String(e) }, "error").catch(() => {});
    return jsonError(500, "delete_failed", "Some of your data couldn't be deleted. Try again, or contact support and we'll finish it for you.");
  }
  return NextResponse.json({ ok: true });
}
