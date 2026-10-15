// Client reports: the emailed summary an agency's clients get, weekly or
// monthly (migration 20261024_client_reports.sql). Pure rules shared by the
// monitor function (when one is due) and notify (what it says). The
// schedule mirrors src/lib/agency/rules.ts on the Worker.

export type Cadence = "weekly" | "monthly";

export const REPORT_HOUR_UTC = 8;
export const RECIPIENTS_PER_CLIENT = 10;
/** Client pages and reports show this many sites at most. */
export const REPORT_SITES = 12;

/** The next Monday (weekly) or 1st of the month (monthly) at 08:00 UTC after `from`. */
export function nextReportAt(cadence: Cadence, from: Date): Date {
  if (cadence === "weekly") {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), REPORT_HOUR_UTC));
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)); // Sunday 0, Monday 1
    if (d <= from) d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, REPORT_HOUR_UTC));
  if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** What a report sent at `end` covers: the 7 days before it, or the month before. */
export function periodStart(cadence: Cadence, end: Date): Date {
  const d = new Date(end);
  if (cadence === "weekly") d.setUTCDate(d.getUTCDate() - 7);
  else d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/** "this week"; "in October" for the calendar month a monthly report covers; "this month" for a test mid-month. */
export function periodPhrase(cadence: Cadence, start: Date): string {
  if (cadence === "weekly") return "this week";
  return start.getUTCDate() === 1 ? `in ${start.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}` : "this month";
}

/** Plans that include hiding Olmene's name (mirrors canWhiteLabel in src/lib/agency/rules.ts). */
export function canWhiteLabel(planSlug: string | null | undefined): boolean {
  return !!planSlug && /^(team|agency)(-yearly)?$/.test(planSlug);
}

/** Who the email says it's from: the agency ("via Olmene" unless white-labelled), or Olmene. */
export function senderName(agency: string | null, whiteLabel: boolean): string {
  return agency ? (whiteLabel ? agency : `${agency} via Olmene`) : "Olmene";
}

/** "Bakery Co's", "Bakery Brothers'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** Email clients show PNG and JPEG everywhere; WebP logos fall back to the agency's name. */
export function emailSafeLogo(url: string | null): string | null {
  return url && /\.(png|jpe?g)$/i.test(url) ? url : null;
}

export interface ReportSite {
  host: string;
  scoreNow: number | null;
  /** The score when the period began (null when the site was first checked during it). */
  scoreBefore: number | null;
  checksPassing: number;
  checksTotal: number;
  /** Checks that failed when the period began and pass now. */
  fixed: number;
}

interface Check {
  check?: unknown;
  status?: unknown;
}

function checks(list: unknown): Check[] {
  return Array.isArray(list) ? (list as Check[]).filter((c) => typeof c?.check === "string") : [];
}

function score(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;
}

/** One site's line in the report, from its latest scan and the last one before the period. */
export function summarizeSite(
  site: { host: string; last_score: unknown; last_checklist: unknown },
  before: { score: unknown; checklist: unknown } | null,
): ReportSite {
  const now = checks(site.last_checklist);
  const passNow = new Set(now.filter((c) => c.status === "pass").map((c) => c.check as string));
  const failedBefore = checks(before?.checklist).filter((c) => c.status !== "pass").map((c) => c.check as string);
  return {
    host: site.host,
    scoreNow: score(site.last_score),
    scoreBefore: before ? score(before.score) : null,
    checksPassing: passNow.size,
    checksTotal: now.length,
    fixed: failedBefore.filter((c) => passNow.has(c)).length,
  };
}
