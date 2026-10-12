/**
 * Customer notification outbox (Worker side). Rows land in
 * public.notifications; the `notify` edge function sends them (Brevo) every
 * minute. The dedupe key makes every event send at most once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationKind =
  | "report_ready"
  | "pr_opened"
  | "fixes_live"
  | "fix_regression"
  | "site_regression"
  | "competitor_change"
  | "weekly_digest";

export async function enqueueNotification(
  db: SupabaseClient,
  n: { userId: string; kind: NotificationKind | string; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  try {
    await db
      .from("notifications")
      .upsert(
        { user_id: n.userId, kind: n.kind, payload: n.payload, dedupe_key: n.dedupeKey },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
  } catch {
    /* a missing email must never fail the work it reports on */
  }
}
