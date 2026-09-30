/**
 * Server-side Supabase access for agent routes.
 *
 * Two clients, mirroring the edge-function discipline (audit §3.2):
 *  - service-role client: the ONLY path that writes agent tables
 *  - publishable-key client: used solely to verify the caller's Bearer JWT
 *
 * Nothing in this module may be imported from client components.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AgentConfigError, supabasePublishableKey, supabaseUrl } from "./env";

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/** Service-role client — bypasses RLS. Handle with care; never log its key. */
export function getServiceDb(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AgentConfigError("Agent routes require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Worker secrets)");
  }
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

/** Anon/publishable client — JWT verification only. */
export function getAnonDb(): SupabaseClient {
  if (anonClient) return anonClient;
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new AgentConfigError("Agent routes require NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  anonClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return anonClient;
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Verify the request's Bearer token and resolve the MarketWise user. */
export async function getUserFromRequest(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await getAnonDb().auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** sha256 hex of a string (before/after content hashes for the audit log). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
