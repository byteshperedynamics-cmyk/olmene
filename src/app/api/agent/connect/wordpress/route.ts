import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError } from "@/lib/agent/http";
import { connectWordpress, saveSiteConnection } from "@/lib/agent/channels";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/connect/wordpress { siteUrl, username, appPassword }
 * Saves a WordPress application password (Users → Profile → Application
 * Passwords). Checked against the site's REST API, encrypted, never returned.
 * Only https sites; the address must be the site the customer scanned.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  let body: { siteUrl?: string; username?: string; appPassword?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const siteUrl = (body.siteUrl ?? "").trim();
  const username = (body.username ?? "").trim();
  const appPassword = (body.appPassword ?? "").trim();
  if (!/^https:\/\//.test(siteUrl)) return ERR.badRequest("The WordPress address must start with https://");
  if (!username || username.length > 100) return ERR.badRequest("username is required.");
  if (appPassword.replace(/\s+/g, "").length !== 24) return ERR.badRequest("Paste the 24-character application password WordPress showed you (spaces are fine).");
  const db = getServiceDb();
  // Only a site this user has scanned or reported on: Olmene is not a generic API proxy.
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const [{ count: scans }, { count: jobs }] = await Promise.all([
    db.from("scans").select("id", { count: "exact", head: true }).eq("user_id", actor.ownerId).ilike("host", `%${host}`),
    db.from("analysis_jobs").select("id", { count: "exact", head: true }).eq("user_id", actor.ownerId).ilike("site_url", `%${host}%`),
  ]);
  if (!(scans ?? 0) && !(jobs ?? 0)) return jsonError(403, "site_not_yours", "Scan this site with Olmene first, then connect it.");
  try {
    const { account } = await connectWordpress(fetch, { siteUrl, username, appPassword });
    const id = await saveSiteConnection(db, actor.ownerId, "wordpress", host, JSON.stringify({ siteUrl, username, appPassword }), {
      siteUrl, user: account.name, canUpload: account.canUpload, canEditPages: account.canEditPages,
      rankMath: account.namespaces.includes("rankmath/v1"), yoast: account.namespaces.includes("yoast/v1"), aioseo: account.namespaces.includes("aioseo/v1"),
    });
    return NextResponse.json({ connection: { id, provider: "wordpress", host, user: account.name } }, { status: 201 });
  } catch (e) {
    return jsonError(422, "connect_failed", e instanceof Error ? e.message.slice(0, 200) : "WordPress refused the login.");
  }
}
