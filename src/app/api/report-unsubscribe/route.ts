import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { jsonError } from "@/lib/agent/http";
import { isUnsubToken, unsubscribeRecipient } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/report-unsubscribe/ { token } — the button on /unsubscribe/:
 * stops one client's emailed report for whoever holds the link. Signed out;
 * the token is the permission. Only POST acts, so mail scanners that open
 * every link in an email unsubscribe nobody.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  if (!isUnsubToken(body?.token)) return jsonError(404, "not_found", "This link isn't valid.");
  if (!(await unsubscribeRecipient(getServiceDb(), body.token))) return jsonError(404, "not_found", "This link isn't valid.");
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
