/**
 * Google Search Console (read-only) for Measure (brief §6.4).
 * Scope: webmasters.readonly. The refresh token is envelope-encrypted with the
 * agent master key and stored on a `connections` row (provider 'google');
 * access tokens live in memory for one request only.
 */
import { getEnv } from "@/lib/agent/env";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type Fetch = typeof fetch;

export function measureEnabled(): boolean {
  const v = (getEnv("MEASURE_FEATURE_ENABLED") ?? "").toLowerCase();
  return v === "true" || v === "1";
}

export function googleClient(): { id: string; secret: string } | null {
  const id = getEnv("GOOGLE_CLIENT_ID");
  const secret = getEnv("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}

export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>, f: Fetch) {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`google token endpoint returned ${res.status}`);
  return (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number };
}

export async function exchangeCode(
  client: { id: string; secret: string },
  code: string,
  redirectUri: string,
  f: Fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const t = await tokenRequest(
    { code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, grant_type: "authorization_code" },
    f,
  );
  if (!t.access_token || !t.refresh_token) throw new Error("google did not return an offline refresh token");
  if (!(t.scope ?? "").split(" ").includes(GSC_SCOPE)) throw new Error("search console read access was not granted");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, scope: t.scope ?? "" };
}

export async function refreshAccessToken(client: { id: string; secret: string }, refreshToken: string, f: Fetch = fetch) {
  const t = await tokenRequest(
    { refresh_token: refreshToken, client_id: client.id, client_secret: client.secret, grant_type: "refresh_token" },
    f,
  );
  if (!t.access_token) throw new Error("google refresh failed");
  return t.access_token;
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listSites(accessToken: string, f: Fetch = fetch): Promise<GscSite[]> {
  const res = await f("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`search console sites returned ${res.status}`);
  const data = (await res.json()) as { siteEntry?: GscSite[] };
  return (data.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

/**
 * Pick the property for the analyzed site: exact URL-prefix property for the
 * origin first, then the domain property (sc-domain:, www-insensitive).
 * Returns null rather than guessing between unrelated properties.
 */
export function pickProperty(sites: GscSite[], siteUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const prefixes = [`${u.protocol}//${u.hostname}/`, `https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`];
  for (const p of prefixes) if (sites.some((s) => s.siteUrl === p)) return p;
  const domain = `sc-domain:${host}`;
  if (sites.some((s) => s.siteUrl === domain)) return domain;
  return null;
}

export interface GscDay {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Daily totals for [startDate, endDate] (YYYY-MM-DD, inclusive). */
export async function queryDaily(
  accessToken: string,
  property: string,
  startDate: string,
  endDate: string,
  f: Fetch = fetch,
): Promise<GscDay[]> {
  const res = await f(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 1000, dataState: "final" }),
    },
  );
  if (!res.ok) throw new Error(`search analytics returned ${res.status}`);
  const data = (await res.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return (data.rows ?? []).map((r) => ({
    date: r.keys[0],
    clicks: Math.round(r.clicks),
    impressions: Math.round(r.impressions),
    ctr: r.ctr,
    position: r.position,
  }));
}
