import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { connectWebflow, saveSiteConnection } from "@/lib/agent/channels";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/connect/webflow { token, siteUrl }
 * Saves a Webflow site API token (Pages + Sites read & write) for the site at
 * siteUrl. The token is checked against Webflow, encrypted, and never returned.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  let body: { token?: string; siteUrl?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const token = (body.token ?? "").trim();
  if (token.length < 20 || token.length > 400 || /\s/.test(token)) return ERR.badRequest("Paste the Webflow API token from your site's settings (Apps & integrations → API access).");
  if (!body.siteUrl || !/^https?:\/\//.test(body.siteUrl)) return ERR.badRequest("siteUrl is required (https://…).");
  try {
    const { site, host } = await connectWebflow(fetch, token, body.siteUrl);
    const id = await saveSiteConnection(getServiceDb(), auth.user.id, "webflow", host, token, {
      siteId: site.id, siteName: site.displayName ?? site.shortName ?? null, domains: (site.customDomains ?? []).map((d) => d.url), siteUrl: body.siteUrl,
    });
    return NextResponse.json({ connection: { id, provider: "webflow", host, siteName: site.displayName ?? site.shortName ?? null } }, { status: 201 });
  } catch (e) {
    return jsonError(422, "connect_failed", e instanceof Error ? e.message.slice(0, 200) : "Webflow refused the token.");
  }
}
