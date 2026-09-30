/**
 * Shared HTTP helpers for agent API routes: feature flag, auth, error shape.
 * Error shape mirrors the edge functions: { error: { code, message } }.
 */

import { NextResponse } from "next/server";
import { agentEnabled } from "./env";
import { getUserFromRequest, type AuthedUser } from "./db";

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const ERR = {
  disabled: () => jsonError(503, "agent_disabled", "The fix agent is not enabled on this deployment."),
  unauthorized: () => jsonError(401, "unauthorized", "Sign in to use the fix agent."),
  forbidden: () => jsonError(403, "forbidden", "Not yours."),
  notFound: (what = "resource") => jsonError(404, "not_found", `${what} not found.`),
  badRequest: (message: string) => jsonError(400, "bad_request", message),
  notConfigured: () =>
    jsonError(503, "github_not_configured", "The GitHub App is not registered yet. Register it from the Agent page."),
};

export async function requireAgent(): Promise<NextResponse | null> {
  return agentEnabled() ? null : ERR.disabled();
}

export async function requireUser(req: Request): Promise<{ user: AuthedUser } | { error: NextResponse }> {
  const user = await getUserFromRequest(req);
  if (!user) return { error: ERR.unauthorized() };
  return { user };
}

export function isHttpError(e: unknown): NextResponse | null {
  return e instanceof NextResponse ? e : null;
}

/** Random URL-safe nonce. */
export function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
