import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError } from "@/lib/agent/http";
import { ALERT_KINDS, allowedHookUrl, maskHookUrl, type ChannelKind } from "@/lib/alerts";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const MAX_CHANNELS = 5;

/** GET /api/alerts/channels — the user's Slack / Discord / webhook destinations (URLs masked). */
export async function GET(req: Request) {
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { data } = await getServiceDb().from("alert_channels").select("id, kind, url, label, kinds, active, failures, last_error, last_sent_at, created_at").eq("user_id", actor.ownerId).order("created_at");
  return NextResponse.json({
    channels: (data ?? []).map((c) => ({ id: c.id, kind: c.kind, url: maskHookUrl(c.url), label: c.label, kinds: c.kinds, active: c.active, failures: c.failures, lastError: c.last_error, lastSentAt: c.last_sent_at, createdAt: c.created_at })),
    kinds: ALERT_KINDS,
  });
}

/**
 * POST /api/alerts/channels { kind: "slack"|"discord"|"webhook", url, label?, kinds?: string[] }
 * Webhooks get a signing secret (returned once) for the X-Olmene-Signature header.
 */
export async function POST(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  let body: { kind?: ChannelKind; url?: string; label?: string; kinds?: string[] };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const kind = body.kind;
  const url = (body.url ?? "").trim();
  if (kind !== "slack" && kind !== "discord" && kind !== "webhook") return ERR.badRequest("kind must be slack, discord or webhook.");
  if (!allowedHookUrl(kind, url)) {
    return ERR.badRequest(kind === "slack" ? "Paste a Slack incoming-webhook URL (https://hooks.slack.com/services/…)." : kind === "discord" ? "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)." : "Webhook URLs must be https:// on a public host.");
  }
  const kinds = (body.kinds ?? []).filter((k) => (ALERT_KINDS as readonly string[]).includes(k));
  const db = getServiceDb();
  const { count } = await db.from("alert_channels").select("id", { count: "exact", head: true }).eq("user_id", actor.ownerId);
  if ((count ?? 0) >= MAX_CHANNELS) return jsonError(409, "limit", `Up to ${MAX_CHANNELS} alert channels.`);
  const secret = kind === "webhook" ? [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("") : null;
  const { data, error } = await db.from("alert_channels").insert({ user_id: actor.ownerId, kind, url, secret, label: (body.label ?? "").slice(0, 60) || null, kinds }).select("id").single();
  if (error || !data) return jsonError(500, "internal", "Could not save the channel.");
  return NextResponse.json({ channel: { id: data.id, kind, url: maskHookUrl(url), kinds }, ...(secret ? { signingSecret: secret } : {}) }, { status: 201 });
}
