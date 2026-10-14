import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { recordOpsEvent } from "@/lib/agent/ops";
import { redactString } from "@/lib/agent/redact";

export const dynamic = "force-dynamic";

/**
 * POST /api/ops/client-error { message, stack?, url?, kind? } — browser errors
 * (window.onerror, unhandled rejections, React error boundaries) land in
 * ops_events as source "browser", so a broken page shows up in health-watch
 * instead of staying invisible. Public, no auth; tiny payloads only; the same
 * message is stored at most once per 10 minutes. No personal data: no user
 * id, IP or query string is kept.
 */
export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > 4096) return new NextResponse(null, { status: 204 });
  let body: { message?: unknown; stack?: unknown; url?: unknown; kind?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const message = typeof body.message === "string" ? redactString(body.message.replace(/\s+/g, " ").trim()).slice(0, 300) : "";
  if (!message) return new NextResponse(null, { status: 204 });
  let path: string | null = null;
  try {
    path = typeof body.url === "string" ? new URL(body.url).pathname.slice(0, 200) : null;
  } catch {
    path = null;
  }
  const db = getServiceDb();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("ops_events").select("id", { count: "exact", head: true }).eq("source", "browser").eq("message", message).gte("created_at", since);
  if ((count ?? 0) === 0) {
    await recordOpsEvent(db, "browser", message, {
      path,
      kind: typeof body.kind === "string" ? body.kind.slice(0, 40) : "error",
      stack: typeof body.stack === "string" ? body.stack.slice(0, 1500) : null,
      ua: (req.headers.get("user-agent") ?? "").slice(0, 160),
    }, "warn");
  }
  return new NextResponse(null, { status: 204 });
}
