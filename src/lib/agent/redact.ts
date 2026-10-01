/**
 * Secret redaction — the last line of defense before anything is logged or
 * written to the audit trail. The FIRST line of defense is structural: tokens
 * only ever exist inside the GitHub client layer and never enter prompts,
 * planned actions, or LLM outputs by construction. This module scrubbed-guarantees
 * the logs anyway (spec §1: "no secrets in logs, errors, analytics, git, client").
 *
 * GitHub token formats (verified against current docs, 2026-09-29 — see
 * docs/integrations.md): installation tokens now use a stateless
 * `ghs_<APPID>_<JWT>` format of VARIABLE length, so patterns must never be
 * length-based.
 */

const TOKEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // GitHub tokens — variable length, prefix-anchored; ghs_ may carry a dotted
  // JWT suffix in the 2026 stateless format (ghs_APPID_jwt)
  { re: /\bghs_[A-Za-z0-9_]+(?:\.[A-Za-z0-9_-]+)*/g, label: "ghs_…" },
  { re: /\bgho_[A-Za-z0-9_]+/g, label: "gho_…" },
  { re: /\bghu_[A-Za-z0-9_]+/g, label: "ghu_…" },
  { re: /\bghr_[A-Za-z0-9_]+/g, label: "ghr_…" },
  { re: /\bghp_[A-Za-z0-9_]+/g, label: "ghp_…" },
  { re: /\bgithub_pat_[A-Za-z0-9_]+/g, label: "github_pat_…" },
  // Cloudflare
  { re: /\bcfat_[A-Za-z0-9_]+/g, label: "cfat_…" },
  // Supabase
  { re: /\bsbp_[a-f0-9]{16,}/g, label: "sbp_…" },
  { re: /\bsb_secret_[A-Za-z0-9_]+/g, label: "sb_secret_…" },
  { re: /\bsb_publishable_[A-Za-z0-9_]+/g, label: "sb_publishable…" },
  // Polar
  { re: /\bwhsec_[A-Za-z0-9+/=_-]+/g, label: "whsec_…" },
  { re: /\bpolar_(?:sc|so)_[A-Za-z0-9]+/g, label: "polar_…" },
  // Google OAuth (Search Console): access tokens ya29.…, refresh tokens 1//…
  { re: /\bya29\.[A-Za-z0-9_-]+/g, label: "ya29.…" },
  { re: /\b1\/\/[A-Za-z0-9_-]{20,}/g, label: "google_refresh" },
  { re: /\bGOCSPX-[A-Za-z0-9_-]+/g, label: "GOCSPX-…" },
  // Generic bearer/authorization headers
  { re: /(Authorization\s*:\s*Bearer\s+)[^\s"']+/gi, label: "bearer" },
  // JWTs (three base64url segments) — access tokens etc.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, label: "jwt" },
  // PEM private key bodies
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: "pem" },
];

const REDACTED = "[REDACTED]";

/** Keys whose *values* are always redacted in structured objects. */
const SENSITIVE_KEY_RE = /(token|secret|password|credential|private_?key|authorization|api_?key)/i;

export function redactString(input: string): string {
  let out = input;
  for (const { re } of TOKEN_PATTERNS) {
    out = out.replace(re, (...args: unknown[]) => {
      // If the pattern captures a prefix (e.g. "Authorization: Bearer "), keep it.
      const group1 = args[1];
      return typeof group1 === "string" ? group1 + REDACTED : REDACTED;
    });
  }
  return out;
}

/** Deep-redact a JSON-serializable value: sensitive keys + token-shaped strings. */
export function redactJson<T>(value: T): T {
  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactJson(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) && v != null ? REDACTED : redactJson(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Structured, secret-free logging for agent code. Everything routed through
 * here passes redaction regardless of the call site.
 */
export function agentLog(
  level: "debug" | "info" | "warn" | "error",
  msg: string,
  fields?: Record<string, unknown>,
): void {
  const entry = { level, msg, ts: new Date().toISOString(), ...(fields ? redactJson(fields) : {}) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
