/**
 * The free-trial request on /business/ (companies and agencies ask for 14
 * days of Team). Shared by the form and the Worker route, so both refuse the
 * same things. Errors carry a field and a code; the page shows the message
 * for that code in the visitor's language (trial.err.* in the dictionaries).
 */

import { normalizeWebsite } from "@/lib/agency/rules";

/** What the offer is. Copy on /business/ and in the dictionaries says the same. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN = "team";

export const TEAM_SIZES = ["1", "2-5", "6-20", "21+"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];
export type TrialKind = "company" | "agency";

export interface TrialRequestInput {
  name: string;
  email: string;
  company: string;
  website: string;
  kind: TrialKind;
  teamSize: TeamSize | null;
  note: string | null;
}

export type TrialField = "name" | "email" | "company" | "website" | "kind" | "teamSize" | "note";

export class TrialInputError extends Error {
  constructor(
    readonly field: TrialField,
    readonly code: string,
  ) {
    super(`${field}: ${code}`);
    this.name = "TrialInputError";
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function line(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Trim and check a request; throws TrialInputError for the first field that's wrong. */
export function cleanTrialRequest(raw: Record<string, unknown>): TrialRequestInput {
  const name = line(raw.name);
  if (!name || name.length > 100) throw new TrialInputError("name", "bad_name");
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) throw new TrialInputError("email", "bad_email");
  const company = line(raw.company);
  if (!company || company.length > 120) throw new TrialInputError("company", "bad_company");
  const website = typeof raw.website === "string" ? normalizeWebsite(raw.website) : null;
  if (!website) throw new TrialInputError("website", "bad_website");
  if (raw.kind !== "company" && raw.kind !== "agency") throw new TrialInputError("kind", "bad_kind");
  let teamSize: TeamSize | null = null;
  if (raw.teamSize !== undefined && raw.teamSize !== null && raw.teamSize !== "") {
    if (!TEAM_SIZES.includes(raw.teamSize as TeamSize)) throw new TrialInputError("teamSize", "bad_team_size");
    teamSize = raw.teamSize as TeamSize;
  }
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > 1000) throw new TrialInputError("note", "bad_note");
  return { name, email, company, website, kind: raw.kind, teamSize, note: note || null };
}

/**
 * Bots fill the hidden field, or post faster than a person can type.
 * `elapsedMs` is measured in the browser (time since the form appeared), so
 * a visitor's wrong clock can't make them look like a bot.
 */
export function looksAutomated(raw: Record<string, unknown>): boolean {
  if (typeof raw.hp === "string" && raw.hp.trim()) return true;
  const elapsed = typeof raw.elapsedMs === "number" ? raw.elapsedMs : NaN;
  return !Number.isFinite(elapsed) || elapsed < 3_000;
}
