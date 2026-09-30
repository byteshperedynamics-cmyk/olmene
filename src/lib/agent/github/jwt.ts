/**
 * GitHub App JWT (RS256) via node:crypto — handles both PKCS#1 and PKCS#8
 * PEM formats (GitHub App keys are issued as PKCS#1 "BEGIN RSA PRIVATE KEY").
 * node:crypto is available on the Cloudflare Worker (nodejs_compat) and in bun.
 *
 * Lifetime: 10 minutes max per GitHub docs (iat −60s clock skew, exp +9 min).
 */

import { createSign } from "node:crypto";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 540, // 9 minutes (GitHub max: 10)
      iss: appId,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(privateKeyPem));
  return `${header}.${payload}.${signature}`;
}

/** Extract a friendly error message from a GitHub API failure response. */
export async function githubErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; errors?: Array<{ message?: string }> };
    const extra = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    return extra ? `${body.message ?? res.statusText} (${extra})` : body.message ?? res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}
