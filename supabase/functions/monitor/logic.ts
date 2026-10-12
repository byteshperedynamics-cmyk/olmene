/**
 * Pure helpers for weekly monitoring: what got worse between two scans, what
 * changed on a competitor's homepage, and ISO weeks for digest de-duplication.
 */

export interface Check {
  check: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

const RANK: Record<Check["status"], number> = { pass: 2, warn: 1, fail: 0 };

/** Checks whose status dropped (pass→warn/fail, warn→fail). Content checks marked "Not measured" never count. */
export function regressions(prev: Check[] | null | undefined, next: Check[]): Array<{ check: string; before: string; after: string }> {
  if (!prev?.length) return [];
  const before = new Map(prev.map((c) => [c.check, c]));
  const out: Array<{ check: string; before: string; after: string }> = [];
  for (const c of next) {
    const b = before.get(c.check);
    if (!b) continue;
    if (c.detail?.startsWith("Not measured") || b.detail?.startsWith("Not measured")) continue;
    if (RANK[c.status] < RANK[b.status]) out.push({ check: c.check, before: b.status, after: c.status });
  }
  return out;
}

export interface CompetitorSnapshot {
  title: string | null;
  h1: string | null;
  pricePoints: string[];
  textHash: string;
}

const clean = (s: string | undefined | null) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export async function snapshotOf(html: string): Promise<CompetitorSnapshot> {
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || null;
  const h1 = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || null;
  const body = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  const prices = [...new Set(body.match(/(?:[$€£]\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:€|£|usd|eur)\b)/gi) ?? [])]
    .map((p) => p.replace(/\s+/g, "").toLowerCase())
    .slice(0, 12)
    .sort();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.slice(0, 20_000).toLowerCase()));
  const textHash = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { title, h1, pricePoints: prices, textHash };
}

/** Human-readable changes between two snapshots (empty when nothing meaningful changed). */
export function competitorChanges(prev: CompetitorSnapshot | null, next: CompetitorSnapshot): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (prev.h1 && next.h1 && prev.h1 !== next.h1) out.push(`New headline: “${next.h1.slice(0, 120)}” (was “${prev.h1.slice(0, 120)}”)`);
  if (prev.title && next.title && prev.title !== next.title) out.push(`New page title: “${next.title.slice(0, 120)}”`);
  const added = next.pricePoints.filter((p) => !prev.pricePoints.includes(p));
  const removed = prev.pricePoints.filter((p) => !next.pricePoints.includes(p));
  if ((added.length || removed.length) && prev.pricePoints.length) {
    out.push(`Prices on the homepage changed: ${added.length ? `now shows ${added.join(", ")}` : ""}${added.length && removed.length ? "; " : ""}${removed.length ? `no longer shows ${removed.join(", ")}` : ""}`);
  }
  return out;
}

/** ISO 8601 week key, e.g. "2026-W42". */
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Public http(s) host on port 80/443 that doesn't name a private or local address. */
export function publicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && !["80", "443"].includes(u.port))) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.includes(":") || /\.(local|internal|localhost|lan|corp|home\.arpa|test|invalid|onion)$/.test(host) || host === "localhost") return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && privateIp(host)) return null;
  return u;
}

export function privateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const a = ip.toLowerCase();
    return a === "::1" || a === "::" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
