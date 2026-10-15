/**
 * Free-trial requests on the Worker: store one, within limits. The notify
 * function emails each to Olmene's inbox (trial_requests.notify_to) with
 * Reply-To the person who asked. Service-role client only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/agent/db";
import type { TrialRequestInput } from "./rules";

/** Requests one network may send in an hour. */
export const PER_IP_PER_HOUR = 3;

export class TrialRateLimited extends Error {
  constructor() {
    super("too many trial requests");
    this.name = "TrialRateLimited";
  }
}

/**
 * Store a request. "duplicate" when the same address already asked in the
 * last day (nothing new is stored: one reply is coming). Throws
 * TrialRateLimited past PER_IP_PER_HOUR from one network.
 */
export async function submitTrialRequest(
  db: SupabaseClient,
  input: TrialRequestInput,
  ctx: { ip: string | null; userId: string | null; language: string | null; notifyTo: string | null; now?: number },
): Promise<"created" | "duplicate"> {
  const now = ctx.now ?? Date.now();
  // The day is part of the hash, so a stored hash can't be matched to an address for long.
  const ipHash = ctx.ip ? await sha256Hex(`trial:${ctx.ip}:${new Date(now).toISOString().slice(0, 10)}`) : null;
  const [byIp, byEmail] = await Promise.all([
    ipHash
      ? db.from("trial_requests").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", new Date(now - 3_600_000).toISOString())
      : Promise.resolve({ count: 0 }),
    db.from("trial_requests").select("id", { count: "exact", head: true }).eq("email", input.email).gte("created_at", new Date(now - 86_400_000).toISOString()),
  ]);
  if ((byIp.count ?? 0) >= PER_IP_PER_HOUR) throw new TrialRateLimited();
  if ((byEmail.count ?? 0) > 0) return "duplicate";
  const { error } = await db.from("trial_requests").insert({
    name: input.name,
    email: input.email,
    company: input.company,
    website: input.website,
    kind: input.kind,
    team_size: input.teamSize,
    note: input.note,
    language: ctx.language,
    user_id: ctx.userId,
    ip_hash: ipHash,
    notify_to: ctx.notifyTo,
  });
  if (error) throw new Error(`trial_requests insert: ${error.message}`);
  return "created";
}
