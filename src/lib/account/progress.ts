/**
 * Progress and milestones, shared by the account page (/app/account/) and the
 * public progress page (/p/[slug]/). Pure functions only: the server
 * (account/server.ts) loads the rows, these shape them.
 */

/** One watched site's progress since Olmene started checking it. */
export interface SiteProgress {
  siteId: string;
  host: string;
  url: string;
  /** When the site was first watched (sites.created_at). */
  since: string;
  monitor: boolean;
  scoreNow: number | null;
  scoreFirst: number | null;
  /** Weekly readiness scores, oldest first (at most HISTORY_POINTS). */
  history: { at: string; score: number }[];
  checksPassing: number;
  checksTotal: number;
  /** Checks that failed on the first scan and pass now. */
  checksFixed: number;
  /** Share of AI-assistant answers that mention the site, 0..1 (null before the first check). */
  aiMentionShare: number | null;
}

export const HISTORY_POINTS = 26;

export type SiteMilestone =
  | "first_scan"
  | "score_50"
  | "score_75"
  | "score_90"
  | "up_10"
  | "up_25"
  | "all_checks"
  | "weeks_4"
  | "weeks_12"
  | "ai_mention";

/** Display order: the journey a site goes through. */
export const SITE_MILESTONES: SiteMilestone[] = [
  "first_scan",
  "score_50",
  "up_10",
  "score_75",
  "weeks_4",
  "ai_mention",
  "up_25",
  "score_90",
  "all_checks",
  "weeks_12",
];

const DAY = 86_400_000;

export function scoreDelta(p: Pick<SiteProgress, "scoreNow" | "scoreFirst">): number | null {
  return p.scoreNow != null && p.scoreFirst != null ? p.scoreNow - p.scoreFirst : null;
}

export function weeksWatched(since: string, now = Date.now()): number {
  const t = Date.parse(since);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / (7 * DAY))) : 0;
}

/** Milestones this site has reached, in SITE_MILESTONES order. */
export function siteMilestones(p: SiteProgress, now = Date.now()): SiteMilestone[] {
  const best = Math.max(p.scoreNow ?? 0, ...p.history.map((h) => h.score));
  const delta = scoreDelta(p) ?? 0;
  const weeks = weeksWatched(p.since, now);
  const got: Record<SiteMilestone, boolean> = {
    first_scan: p.history.length > 0 || p.scoreNow != null,
    score_50: best >= 50,
    score_75: best >= 75,
    score_90: best >= 90,
    up_10: delta >= 10,
    up_25: delta >= 25,
    all_checks: p.checksTotal > 0 && p.checksPassing === p.checksTotal,
    weeks_4: p.monitor && weeks >= 4,
    weeks_12: p.monitor && weeks >= 12,
    ai_mention: (p.aiMentionShare ?? 0) > 0,
  };
  return SITE_MILESTONES.filter((m) => got[m]);
}

/** Readiness scores from scan rows (any order, nulls dropped), oldest first, last HISTORY_POINTS kept. */
export function shapeHistory(rows: { created_at: string; score: unknown }[]): { at: string; score: number }[] {
  return rows
    .map((r) => ({ at: r.created_at, score: typeof r.score === "number" ? Math.round(r.score) : Number.NaN }))
    .filter((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 && Number.isFinite(Date.parse(r.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-HISTORY_POINTS);
}

interface Check {
  check?: unknown;
  status?: unknown;
}

function passing(list: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(list)) return out;
  for (const c of list as Check[]) if (typeof c?.check === "string" && c.status === "pass") out.add(c.check);
  return out;
}

/** { passing, total, fixed } from the latest checklist and the first one. */
export function checklistProgress(latest: unknown, first: unknown): { passing: number; total: number; fixed: number } {
  const now = Array.isArray(latest) ? (latest as Check[]).filter((c) => typeof c?.check === "string") : [];
  const passNow = passing(latest);
  const passThen = passing(first);
  const firstNames = new Set(Array.isArray(first) ? (first as Check[]).map((c) => c?.check).filter((c): c is string => typeof c === "string") : []);
  let fixed = 0;
  for (const name of passNow) if (firstNames.has(name) && !passThen.has(name)) fixed++;
  return { passing: passNow.size, total: now.length, fixed };
}

// ── Account-wide milestones (the account page) ─────────────────────────────

export interface AccountSummary {
  createdAt: string | null;
  hasName: boolean;
  hasPhoto: boolean;
  reports: number;
  sites: SiteProgress[];
  /** Merged fix pull requests plus guided fixes confirmed live. */
  fixesShipped: number;
  shares: number;
}

export type AccountMilestoneId =
  | "joined"
  | "profile"
  | "first_report"
  | "first_site"
  | "first_fix"
  | "score_75"
  | "up_10"
  | "shared"
  | "weeks_4"
  | "ai_mention";

export interface AccountMilestone {
  id: AccountMilestoneId;
  earned: boolean;
}

export const ACCOUNT_MILESTONES: AccountMilestoneId[] = [
  "joined",
  "profile",
  "first_report",
  "first_site",
  "first_fix",
  "score_75",
  "up_10",
  "shared",
  "weeks_4",
  "ai_mention",
];

export function accountMilestones(s: AccountSummary, now = Date.now()): AccountMilestone[] {
  const anySite = (m: SiteMilestone) => s.sites.some((p) => siteMilestones(p, now).includes(m));
  const got: Record<AccountMilestoneId, boolean> = {
    joined: true,
    profile: s.hasName && s.hasPhoto,
    first_report: s.reports > 0,
    first_site: s.sites.length > 0,
    first_fix: s.fixesShipped > 0,
    score_75: anySite("score_75"),
    up_10: anySite("up_10"),
    shared: s.shares > 0,
    weeks_4: anySite("weeks_4"),
    ai_mention: anySite("ai_mention"),
  };
  return ACCOUNT_MILESTONES.map((id) => ({ id, earned: got[id] }));
}

/** The first milestone not yet earned: what the account page suggests next. */
export function nextMilestone(list: AccountMilestone[]): AccountMilestoneId | null {
  return list.find((m) => !m.earned)?.id ?? null;
}

// ── Names and share links ──────────────────────────────────────────────────

/** Trimmed, single-spaced, 1–60 characters, no control characters; null if unusable. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  return [...v].slice(0, 60).join("");
}

/** First name for greetings: "Ada Lovelace" → "Ada"; an email's local part when there is no name. */
export function firstName(name: string | null | undefined, email: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0];
  if (!local) return null;
  const word = local.split(/[._+-]/)[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : null;
}

/** Up to two initials for the monogram avatar. */
export function initials(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const first = [...parts[0]][0] ?? "";
    const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? ([...e][0] ?? "?").toUpperCase() : "?";
}

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no l, 0, 1: easy to read aloud

/** A 10-character link id (about 50 bits). */
export function newShareSlug(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(10);
  let out = "";
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

export function isShareSlug(s: unknown): s is string {
  return typeof s === "string" && /^[a-z0-9]{10}$/.test(s);
}
