/**
 * Agent server-side environment access.
 *
 * Secrets live ONLY here — as Worker env (Wrangler secrets in production,
 * .env.local during next dev). They are never persisted to the database and
 * never sent to the client. Modules in this folder are server-only: they are
 * imported exclusively by API routes and never from client components.
 */

import { APP_URL as CONFIG_APP_URL, SUPABASE_URL as CONFIG_SB_URL, SUPABASE_PUBLISHABLE_KEY as CONFIG_SB_KEY } from "../config";

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

/** Master feature flag (server side). Default OFF. */
export function agentEnabled(): boolean {
  const v = (process.env.AGENT_FEATURE_ENABLED ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = getEnv(name);
  if (!v) {
    throw new AgentConfigError(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function supabaseUrl(): string {
  return getEnv("SUPABASE_URL") ?? getEnv("NEXT_PUBLIC_SUPABASE_URL") ?? CONFIG_SB_URL;
}

export function supabasePublishableKey(): string {
  return (
    getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? getEnv("SUPABASE_PUBLISHABLE_KEY") ?? CONFIG_SB_KEY
  );
}

export function appUrl(): string {
  return getEnv("APP_URL") ?? getEnv("NEXT_PUBLIC_APP_URL") ?? CONFIG_APP_URL;
}

/** GitHub API base — overridable for tests/mocks. */
export function githubApiBase(): string {
  return getEnv("GITHUB_API_BASE") ?? "https://api.github.com";
}

export function githubWebBase(): string {
  return getEnv("GITHUB_WEB_BASE") ?? "https://github.com";
}

export function agentLlmDailyCap(): number {
  const n = parseInt(getEnv("AGENT_LLM_DAILY_CAP") ?? "300", 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/** App URL helpers for OAuth redirects (always the deployed origin). */
export function absoluteUrl(path: string): string {
  const base = appUrl().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
