/**
 * Automatic rollback (engine v2, opt-in: AUTO_ROLLBACK=1 + CF_DEPLOY_TOKEN
 * with "Workers Scripts: Edit" + CF_ACCOUNT_ID). When the Worker's API
 * routes fail two health checks in a row (10 minutes) and the current
 * deployment is less than 3 hours old, the previous version goes back to
 * 100% through the Cloudflare API. Once per 3 hours at most; an older
 * deployment is never rolled back (the cause is probably not the code).
 */

export interface CfDeployment {
  id: string;
  created_on: string;
  versions: Array<{ version_id: string; percentage: number }>;
}

const top = (d: CfDeployment) => [...d.versions].sort((a, b) => b.percentage - a.percentage)[0]?.version_id ?? null;

/** The version to restore, or null with the reason. */
export function rollbackTarget(deployments: CfDeployment[], now: Date, windowMs = 3 * 3_600_000): { versionId: string | null; reason: string } {
  const sorted = [...deployments].sort((a, b) => b.created_on.localeCompare(a.created_on));
  const current = sorted[0];
  if (!current) return { versionId: null, reason: "no deployments" };
  if (now.getTime() - new Date(current.created_on).getTime() > windowMs) return { versionId: null, reason: "current deployment is older than 3 hours" };
  const currentTop = top(current);
  const previous = sorted.slice(1).find((d) => top(d) && top(d) !== currentTop);
  if (!previous) return { versionId: null, reason: "no earlier version to restore" };
  return { versionId: top(previous), reason: `restoring the version deployed ${previous.created_on}` };
}

const API = "https://api.cloudflare.com/client/v4";

export async function listDeployments(account: string, script: string, token: string): Promise<CfDeployment[]> {
  const res = await fetch(`${API}/accounts/${account}/workers/scripts/${script}/deployments`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Cloudflare deployments ${res.status}`);
  const body = await res.json() as { result?: { deployments?: CfDeployment[] } };
  return body.result?.deployments ?? [];
}

export async function deployVersion(account: string, script: string, token: string, versionId: string, message: string): Promise<void> {
  const res = await fetch(`${API}/accounts/${account}/workers/scripts/${script}/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ strategy: "percentage", versions: [{ version_id: versionId, percentage: 100 }], annotations: { "workers/message": message } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Cloudflare deploy ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}
