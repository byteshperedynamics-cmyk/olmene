import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { recordOpsEvent } from "@/lib/agent/ops";
import { busyWith, countFixesShipped, deleteAccount, loadSiteProgress, renewingPlan } from "@/lib/account/server";
import { cleanDisplayName } from "@/lib/account/progress";
import { otherMembers, requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/ — the account page in one call: each watched site's
 * progress, totals, progress links, and whether a plan will renew (which
 * blocks deleting the account until it's cancelled).
 */
export async function GET(req: Request) {
  // Progress is the workspace's (whoever's account you're working in); the
  // plan that blocks deleting an account is your own.
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const db = getServiceDb();
  const uid = r.actor.ownerId;
  const [sites, fixesShipped, { count: reports }, { data: shares }, plan] = await Promise.all([
    loadSiteProgress(db, uid),
    countFixesShipped(db, uid),
    db.from("reports").select("id", { count: "exact", head: true }).eq("user_id", uid),
    db.from("progress_shares").select("site_id, slug, show_name, views, created_at").eq("user_id", uid),
    renewingPlan(db, r.actor.user.id),
  ]);
  return NextResponse.json({
    sites,
    totals: { reports: reports ?? 0, fixesShipped, sites: sites.length },
    shares: ((shares ?? []) as { site_id: string; slug: string; show_name: boolean; views: number; created_at: string }[]).map((s) => ({
      siteId: s.site_id,
      slug: s.slug,
      showName: s.show_name,
      views: s.views,
      createdAt: s.created_at,
    })),
    plan: { renews: !!plan, renewsAt: plan?.renewsAt ?? null },
  });
}

/** PATCH /api/account/ { displayName?, notifyEmail?, digestEmail?, onboarded? } */
export async function PATCH(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const patch: Record<string, unknown> = {};
  if ("displayName" in body) {
    if (body.displayName === null || body.displayName === "") patch.display_name = null;
    else {
      const name = cleanDisplayName(body.displayName);
      if (!name) return jsonError(400, "bad_name", "Enter a name between 1 and 60 characters.");
      patch.display_name = name;
    }
  }
  if (typeof body.notifyEmail === "boolean") patch.notify_email = body.notifyEmail;
  if (typeof body.digestEmail === "boolean") patch.digest_email = body.digestEmail;
  if (body.onboarded === true) patch.onboarded_at = new Date().toISOString();
  if (!Object.keys(patch).length) return ERR.badRequest("Nothing to update.");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await getServiceDb()
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select("display_name, notify_email, digest_email, onboarded_at")
    .maybeSingle();
  if (error) return jsonError(500, "save_failed", "Couldn't save your changes. Try again in a moment.");
  if (!data) return ERR.notFound("profile");
  return NextResponse.json({ ok: true, profile: data });
}

/**
 * DELETE /api/account/ { confirm: "<your email>" } — deletes the account and
 * everything in it. Refused while a plan would still renew (cancel it in the
 * billing portal first, so nobody is charged for an account that's gone) or
 * while an analysis or fix run is in progress.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const expected = (auth.user.email ?? "").trim().toLowerCase();
  const typed = typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  if (!expected || typed !== expected) return jsonError(400, "confirm_mismatch", "Type your email address exactly as shown to confirm.");

  const db = getServiceDb();
  const plan = await renewingPlan(db, auth.user.id);
  if (plan) {
    return jsonError(409, "plan_active", "Your plan still renews. Cancel it in the billing portal first, then delete your account.");
  }
  const busy = await busyWith(db, auth.user.id);
  if (busy) {
    return jsonError(
      409,
      "busy",
      busy === "analysis" ? "An analysis is still running. Wait for it to finish, then try again." : "A fix run is still in progress. Wait for it to finish, then try again.",
    );
  }
  // Deleting an account deletes its workspace: nobody should lose access by surprise.
  const others = await otherMembers(db, auth.user.id);
  if (others > 0) {
    return jsonError(
      409,
      "team_members",
      `${others === 1 ? "One other person works" : `${others} other people work`} in your workspace. Remove them on the Team page first, then delete your account.`,
    );
  }
  try {
    await deleteAccount(db, auth.user.id);
  } catch (e) {
    await recordOpsEvent(db, "account", "account deletion failed", { error: e instanceof Error ? e.message : String(e) }, "error").catch(() => {});
    return jsonError(500, "delete_failed", "Your account couldn't be fully deleted. Try again, or contact support and we'll finish it for you.");
  }
  return NextResponse.json({ ok: true });
}
