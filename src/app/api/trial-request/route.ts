import { NextResponse } from "next/server";
import { getServiceDb, getUserFromRequest } from "@/lib/agent/db";
import { jsonError } from "@/lib/agent/http";
import { SUPPORT_EMAIL } from "@/lib/config";
import { cleanTrialRequest, looksAutomated, TrialInputError } from "@/lib/trial/rules";
import { submitTrialRequest, TrialRateLimited } from "@/lib/trial/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/trial-request/ { name, email, company, website, kind, teamSize?,
 * note?, language?, hp, elapsedMs } — a company or agency asks for a free
 * trial of the Agency plan (/business/). Signed out is fine; signed in, the request
 * names the account. 400 { error: { code, field } } for a field to fix,
 * 429 past the limit; bots get a quiet 202 and nothing is stored.
 */
export async function POST(req: Request) {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return jsonError(400, "bad_request", "Invalid JSON body.");
  if (looksAutomated(raw)) return NextResponse.json({ ok: true }, { status: 202 });
  let input;
  try {
    input = cleanTrialRequest(raw);
  } catch (e) {
    if (e instanceof TrialInputError) return NextResponse.json({ error: { code: e.code, field: e.field, message: e.message } }, { status: 400 });
    throw e;
  }
  const language = typeof raw.language === "string" && /^[a-z]{2}$/.test(raw.language) ? raw.language : null;
  const user = await getUserFromRequest(req).catch(() => null);
  try {
    const result = await submitTrialRequest(getServiceDb(), input, {
      ip: req.headers.get("cf-connecting-ip"),
      userId: user?.id ?? null,
      language,
      notifyTo: SUPPORT_EMAIL,
    });
    return NextResponse.json({ ok: true, duplicate: result === "duplicate" }, { status: 201 });
  } catch (e) {
    if (e instanceof TrialRateLimited) return jsonError(429, "slow_down", "Too many requests from this network. Try again in an hour.");
    console.error("trial request not saved:", e instanceof Error ? e.message : e);
    return jsonError(500, "save_failed", "Couldn't send your request. Try again in a moment.");
  }
}
