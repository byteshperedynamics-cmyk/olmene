/**
 * Agency rules shared by the browser and the Worker (no I/O here): what a
 * client and a brand may look like, client page ids, which plans include
 * white label, and which logo files are accepted.
 */

import { TeamError } from "@/lib/workspace/roles";

/** Plans that include hiding Olmene's name on client pages. */
export function canWhiteLabel(planSlug: string | null | undefined): boolean {
  return !!planSlug && /^(team|agency)(-yearly)?$/.test(planSlug);
}

// ── Client pages (/c/<slug>/) ──────────────────────────────────────────────

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no l, 0, 1: easy to read aloud

/** A 12-character client page id (about 60 bits). */
export function newPortalSlug(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  for (const b of random(12)) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

export function isPortalSlug(s: unknown): s is string {
  return typeof s === "string" && /^[a-z0-9]{12}$/.test(s);
}

export function portalPath(slug: string): string {
  return `/c/${slug}/`;
}

// ── Client reports (emailed weekly or monthly) ─────────────────────────────

export type ReportCadence = "off" | "weekly" | "monthly";

export function isReportCadence(v: unknown): v is ReportCadence {
  return v === "off" || v === "weekly" || v === "monthly";
}

/** People one client's report goes to (those who unsubscribed don't count). */
export const RECIPIENTS_PER_CLIENT = 10;
/** And across a workspace, so reports can't become a mailing list. */
export const RECIPIENTS_PER_WORKSPACE = 250;
/** Reports go out at 08:00 UTC. */
export const REPORT_HOUR_UTC = 8;

/**
 * When the next report goes out after `from`: the next Monday (weekly) or
 * 1st of the month (monthly) at 08:00 UTC; null when reports are off.
 * Mirrored in supabase/functions/_shared/client-report.ts (the monitor
 * function moves it on after each one).
 */
export function nextReportAt(cadence: ReportCadence, from: Date): Date | null {
  if (cadence === "weekly") {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), REPORT_HOUR_UTC));
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)); // Sunday 0, Monday 1
    if (d <= from) d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  if (cadence === "monthly") {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, REPORT_HOUR_UTC));
    if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A report recipient's address, lower-cased; throws TeamError(400) with a message to show. */
export function cleanRecipientEmail(raw: unknown): string {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!e || e.length > 254 || !EMAIL.test(e)) throw new TeamError(400, "bad_email", "That email address doesn't look right.");
  return e;
}

// ── What people type ───────────────────────────────────────────────────────

/** One line of text: collapsed whitespace, trimmed. */
function line(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/**
 * A website address as people type it ("bakery.com", "https://bakery.com/shop"),
 * or null when it can't be one. No credentials, no other schemes.
 */
export function normalizeWebsite(raw: string, opts: { httpsOnly?: boolean } = {}): string | null {
  const w = raw.trim();
  if (!w || w.length > 300 || /\s/.test(w)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(w) ? w : `https://${w}`);
  } catch {
    return null;
  }
  const okScheme = opts.httpsOnly ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  if (!okScheme || url.username || url.password) return null;
  // URL() has already turned international names into xn-- form.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  return url.toString();
}

export interface ClientInput {
  name?: string;
  website?: string | null;
  contactEmail?: string | null;
  reportCadence?: ReportCadence;
}

/** Trim and check a client form; throws TeamError(400) with a message to show. */
export function cleanClientInput(raw: Record<string, unknown>, requireName: boolean): ClientInput {
  const out: ClientInput = {};
  if (raw.name !== undefined || requireName) {
    const name = line(raw.name);
    if (!name || name.length > 80) throw new TeamError(400, "bad_name", "Give the client a name of up to 80 characters.");
    out.name = name;
  }
  if (raw.website !== undefined && raw.website !== null) {
    const w = typeof raw.website === "string" ? raw.website.trim() : "";
    if (!w) out.website = null;
    else {
      const url = normalizeWebsite(w);
      if (!url) throw new TeamError(400, "bad_website", "That website address doesn't look right.");
      out.website = url;
    }
  } else if (raw.website === null) out.website = null;
  if (raw.contactEmail !== undefined && raw.contactEmail !== null) {
    const e = typeof raw.contactEmail === "string" ? raw.contactEmail.trim().toLowerCase() : "";
    if (!e) out.contactEmail = null;
    else if (e.length > 254 || !EMAIL.test(e)) throw new TeamError(400, "bad_email", "That email address doesn't look right.");
    else out.contactEmail = e;
  } else if (raw.contactEmail === null) out.contactEmail = null;
  if (raw.reportCadence !== undefined) {
    if (!isReportCadence(raw.reportCadence)) throw new TeamError(400, "bad_cadence", "Reports go out weekly, monthly, or not at all.");
    out.reportCadence = raw.reportCadence;
  }
  return out;
}

export interface BrandInput {
  name?: string | null;
  color?: string | null;
  url?: string | null;
  whiteLabel?: boolean;
}

/** Trim and check the branding form; throws TeamError(400) with a message to show. */
export function cleanBrandInput(raw: Record<string, unknown>): BrandInput {
  const out: BrandInput = {};
  if (raw.name !== undefined) {
    const n = line(raw.name);
    if (n.length > 80) throw new TeamError(400, "bad_name", "Keep the name to 80 characters.");
    out.name = n || null;
  }
  if (raw.color !== undefined) {
    const c = typeof raw.color === "string" ? raw.color.trim().toLowerCase() : "";
    if (c && !/^#[0-9a-f]{6}$/.test(c)) throw new TeamError(400, "bad_color", "Use a colour like #1f6feb.");
    out.color = c || null;
  }
  if (raw.url !== undefined) {
    const u = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!u) out.url = null;
    else {
      const url = normalizeWebsite(u, { httpsOnly: true });
      if (!url) throw new TeamError(400, "bad_url", "Use your website's https address.");
      out.url = url;
    }
  }
  if (raw.whiteLabel !== undefined) {
    if (typeof raw.whiteLabel !== "boolean") throw new TeamError(400, "bad_request", "whiteLabel is true or false.");
    out.whiteLabel = raw.whiteLabel;
  }
  return out;
}

// ── Logos ──────────────────────────────────────────────────────────────────

export const LOGO_MAX_BYTES = 524_288;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/** The image type from its first bytes (never trust the declared type alone). No SVG: it can carry script. */
export function sniffImage(b: Uint8Array): LogoType | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
