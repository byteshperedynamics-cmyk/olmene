import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { checkApplyEntitlement } from "@/lib/agent/entitlement";

export const dynamic = "force-dynamic";

/** GET /api/agent/pr-checks — repos with PR checks on, and the latest checks posted. */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const db = getServiceDb();
  const [{ data: repos }, { data: checks }] = await Promise.all([
    db.from("pr_check_repos").select("id, repo, site_url, enabled, last_error, last_polled_at, created_at").eq("user_id", auth.user.id).order("created_at"),
    db.from("pr_checks").select("repo, pr_number, head_sha, preview_url, conclusion, regressions, improvements, check_run_url, created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  return NextResponse.json({ repos: repos ?? [], checks: checks ?? [] });
}

/**
 * POST /api/agent/pr-checks { repo, siteUrl, enabled }
 * Turn Olmene checks on (or off) for every pull request in one repository
 * on the user's GitHub connection. siteUrl is the live site PR previews are
 * compared with. Paid plans.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  let body: { repo?: string; siteUrl?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const repo = body.repo ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return ERR.badRequest("repo must look like owner/repo.");
  const db = getServiceDb();
  if (body.enabled === false) {
    await db.from("pr_check_repos").update({ enabled: false }).eq("user_id", auth.user.id).eq("repo", repo);
    return NextResponse.json({ ok: true, enabled: false });
  }
  if (!body.siteUrl || !/^https:\/\//.test(body.siteUrl)) return ERR.badRequest("siteUrl (your live site, https://…) is required.");
  const entitlement = await checkApplyEntitlement(db, auth.user.id);
  if (!entitlement.allowed && entitlement.code === "plan_required") return jsonError(402, "plan_required", "Pull request checks are part of the Fix and Team plans.");
  const { data: connection } = await db.from("connections").select("id, resource_ids").eq("user_id", auth.user.id).eq("provider", "github").eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!connection) return ERR.badRequest("Connect your GitHub account first (Agent page → Connect GitHub).");
  const repos = (connection.resource_ids as string[] | null) ?? [];
  if (repos.length > 0 && !repos.includes(repo)) return ERR.badRequest(`${repo} is not accessible through your GitHub connection.`);
  const { error } = await db.from("pr_check_repos").upsert({ user_id: auth.user.id, connection_id: connection.id, repo, site_url: body.siteUrl, enabled: true, last_error: null }, { onConflict: "user_id,repo" });
  if (error) return jsonError(500, "internal", "Could not save the setting.");
  return NextResponse.json({ ok: true, enabled: true });
}
