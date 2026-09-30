/**
 * Apply-entitlement + action quota.
 *
 * User decision 2026-09-29: Starter 10 / Pro 30 actions per billing period,
 * where ONE pull request (any number of fixes inside) = ONE action.
 * Free / one-time-credit users: plan + preview only — the approve endpoint
 * refuses to flip a job into `applying` without an active subscription.
 * Quota usage is counted from the append-only audit log, so it is exactly as
 * trustworthy as the log itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EntitlementCheck {
  allowed: boolean;
  code?: "plan_required" | "quota_exceeded";
  message?: string;
  planName?: string | null;
  limit: number;
  used: number;
  remaining: number;
  periodStart?: string | null;
}

export async function checkApplyEntitlement(db: SupabaseClient, userId: string): Promise<EntitlementCheck> {
  const { data: subs, error } = await db
    .from("subscriptions")
    .select("status, current_period_start, current_period_end, polar_product_id")
    .eq("user_id", userId)
    .order("current_period_start", { ascending: false })
    .limit(10);
  if (error) throw new Error(`subscription read failed: ${error.message}`);

  const now = new Date();
  const active = (subs ?? []).find(
    (s: { status: string; current_period_start: string; current_period_end: string | null }) =>
      (s.status === "active" || s.status === "trialing") &&
      new Date(s.current_period_start ?? 0) <= now &&
      (!s.current_period_end || new Date(s.current_period_end) > now),
  );
  if (!active) {
    return {
      allowed: false,
      code: "plan_required",
      message: "Applying fixes requires a subscription (Starter or Pro). Your plan and previews are free.",
      limit: 0,
      used: 0,
      remaining: 0,
    };
  }

  const { data: planRows, error: planErr } = await db
    .from("plans")
    .select("name, actions_per_period")
    .eq("polar_product_id", active.polar_product_id)
    .limit(1);
  if (planErr) throw new Error(`plan read failed: ${planErr.message}`);
  const plan = (planRows ?? [])[0] as { name: string; actions_per_period: number } | undefined;
  const limit = plan?.actions_per_period ?? 0;
  if (limit <= 0) {
    return {
      allowed: false,
      code: "plan_required",
      message: "Your current plan includes reports but not fix applications. Upgrade to Starter or Pro to apply.",
      planName: plan?.name ?? null,
      limit: 0,
      used: 0,
      remaining: 0,
    };
  }

  const periodStart = (active as { current_period_start: string }).current_period_start;
  const { count, error: countErr } = await db
    .from("agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_type", "apply")
    .eq("result", "success")
    .gte("created_at", periodStart);
  if (countErr) throw new Error(`quota count failed: ${countErr.message}`);
  const used = count ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      code: "quota_exceeded",
      message: `Action quota reached (${used}/${limit} this period). Your quota resets with the next billing period.`,
      planName: plan?.name ?? null,
      limit,
      used,
      remaining: 0,
      periodStart,
    };
  }
  return {
    allowed: true,
    planName: plan?.name ?? null,
    limit,
    used,
    remaining: limit - used,
    periodStart,
  };
}
