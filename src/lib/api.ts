"use client";

import { fnUrl } from "./config";
import { getSupabase } from "./supabase";
import { activeWorkspace } from "./workspace/client";

export class ApiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiRequestError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const session = (await supabase?.auth.getSession())?.data.session;
  const token = session?.access_token ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(fnUrl(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      (data as { error?: { code?: string; message?: string } })?.error?.code ?? "request_failed",
      (data as { error?: { code?: string; message?: string } })?.error?.message ??
        "Request failed. Please try again.",
    );
  }
  return data as T;
}

// ── Edge function calls ──────────────────────────────────────────────────

export interface StartAnalysisInput {
  siteUrl: string;
  productName?: string;
  targetMarket?: string;
  knownCompetitors: string[];
  goal: string;
  language: string;
}

export async function startAnalysis(input: StartAnalysisInput): Promise<{ jobId: string }> {
  // In a shared workspace the report is the workspace's (its plan and quota).
  const workspace = activeWorkspace();
  return post("start-analysis", workspace ? { ...input, workspace } : input);
}

export async function advanceAnalysis(jobId: string): Promise<unknown> {
  return post("advance-analysis", { jobId });
}

export async function createCheckout(productId: string): Promise<{ url: string }> {
  return post("create-checkout", { productId });
}

export async function createPortalSession(): Promise<{ url: string }> {
  return post("create-portal-session", {});
}

// ── Free instant diagnosis (public, no auth) ─────────────────────────────

export interface FreeAuditFinding {
  title: string;
  severity: "critical" | "high" | "medium";
  evidence: string;
  whatToChange: string;
  /** Short impact label, e.g. "conversion friction" — presented as a HYPOTHESIS, never as fact. */
  impact?: string;
  /** Business implication of the deterministic finding — labelled as hypothesis in the UI. */
  impactHypothesis?: string;
}
export interface FreeAuditCheck {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}
export interface FreeAuditResult {
  siteUrl: string;
  fetchedAt: string;
  scores: { overall: number; seo: number; messaging: number; conversion: number };
  passedChecks: number;
  totalChecks: number;
  highImpactCount?: number;
  findings: FreeAuditFinding[];
  hiddenFindings: number;
  opportunity: { title: string; why: string };
  checklist: FreeAuditCheck[];
  stats: {
    wordCount: number;
    images: number;
    imagesWithoutAlt: number;
    internalLinks: number;
    externalLinks: number;
    ctaButtons: string[];
    trustSignals: string[];
    h1: string | null;
    title: string | null;
    metaDescription?: string | null;
    hasStructuredData: boolean;
    hasPricingPage: boolean;
    /** engine v2 */
    lang?: string | null;
    appStoreId?: string | null;
    phoneLinks?: number;
  };
  /** Saved scan id (share link / carry through sign-in / free fix preview); null if saving failed. */
  scanId?: string | null;
  /** True when served from a scan of the same URL made in the last 10 minutes. */
  cached?: boolean;
  /** False when the page is a JavaScript shell that couldn't be rendered: content checks say "Not measured". */
  contentMeasured?: boolean;
  /** True when the page was rendered in a browser to read its content. */
  rendered?: boolean;
  /** What the site is built with, and whether the fix agent can open PRs for it. */
  platform?: FreeAuditPlatform;
  /** Extra checks, not part of the score (AI search, performance, security, links, business). */
  extras?: FreeAuditExtra[];
  /** engine v2: what kind of business the site is (drives the "Business" extra checks). */
  category?: FreeAuditCategory;
  /** engine v2: data for drawing the Google result and the shared-link card. */
  preview?: FreeAuditPreview;
  /** engine v2: screenshot of the first screen with pins; "pending" until ready (poll getFreeAudit or use the stream). */
  shot?: FreeAuditShot;
  /** engine v2: present once getScanProposals() has run for this scan. */
  proposals?: FreeAuditProposals;
}

export type FixMode = "pr" | "api" | "guided";

export interface FreeAuditPlatform {
  id: string;
  label: string;
  /** Kept for older screens; prefer fixModes. */
  fixable: "yes" | "partial" | "no" | "unknown";
  /** engine v2: how Olmene can fix this site, best first. Every platform has "guided". */
  fixModes?: FixMode[];
  note: string;
}

export interface FreeAuditExtra {
  id: string;
  group: "AI search" | "Performance" | "Security" | "SEO" | "Social" | "Business";
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export type BusinessCategoryId = "ecommerce" | "restaurant" | "local" | "saas" | "app" | "agency" | "content" | "nonprofit" | "course" | "other";

export interface FreeAuditCategory {
  id: BusinessCategoryId;
  label: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

export interface FreeAuditPreview {
  serp: { title: string | null; description: string | null; displayUrl: string; favicon: string | null; siteName: string | null };
  social: { title: string | null; description: string | null; image: string | null; siteName: string | null; card: string | null; host: string };
}

export interface FreeAuditPin {
  check: string;
  kind: "h1" | "cta" | "image-alt" | "pricing" | "form";
  status: "pass" | "warn" | "fail";
  label: string;
  text: string | null;
  /** Pixels in the screenshot (1280×800). */
  box: { x: number; y: number; w: number; h: number };
}

export interface FreeAuditShot {
  status: "ready" | "pending" | "unavailable";
  url?: string;
  width?: number;
  height?: number;
  pins?: FreeAuditPin[];
  capturedAt?: string;
}

export interface FreeAuditProposals {
  generatedAt: string;
  model: string | null;
  fields: Array<{ field: "title" | "metaDescription"; before: string | null; after: string; rationale: string }>;
  tags: Array<{ id: string; html: string; why: string }>;
  /** Ready to paste into <head>. Escaped HTML text — render it as text in a code block, never as HTML. */
  snippet: string;
  previewAfter: { serp: { title: string | null; description: string | null }; social: { title: string | null; description: string | null } };
}

/** Events of the streaming scan, one per line. "done" carries the full result; "shot" may follow it. */
export type FreeAuditStreamEvent =
  | { type: "start"; url: string }
  | { type: "page"; siteUrl: string; platform: FreeAuditPlatform }
  | { type: "rendering" }
  | { type: "checklist"; checklist: FreeAuditCheck[] }
  | { type: "scores"; scores: FreeAuditResult["scores"] }
  | { type: "category"; category: FreeAuditCategory }
  | { type: "extra"; check: FreeAuditExtra }
  | { type: "done"; result: FreeAuditResult }
  | { type: "shot"; shot: FreeAuditShot }
  | { type: "error"; error: { code: string; message: string } };

/**
 * Streaming free scan: calls onEvent for each step as it happens and resolves
 * with the final result. Rate limits and bad URLs reject like runFreeAudit.
 */
export async function streamFreeAudit(url: string, onEvent: (e: FreeAuditStreamEvent) => void, signal?: AbortSignal): Promise<FreeAuditResult> {
  const res = await fetch(fnUrl("free-audit"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ url, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiRequestError(
      res.status,
      (data as { error?: { code?: string } })?.error?.code ?? "request_failed",
      (data as { error?: { message?: string } })?.error?.message ?? "Request failed. Please try again.",
    );
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: FreeAuditResult | null = null;
  let failure: { code: string; message: string } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: FreeAuditStreamEvent;
    try {
      event = JSON.parse(line) as FreeAuditStreamEvent;
    } catch {
      return;
    }
    if (event.type === "done") result = event.result;
    if (event.type === "shot" && result) result = { ...result, shot: event.shot };
    if (event.type === "error") failure = event.error;
    onEvent(event);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer);
  if (result) return result;
  const f = failure as { code: string; message: string } | null;
  throw new ApiRequestError(422, f?.code ?? "scan_failed", f?.message ?? "The scan failed. Please try again.");
}

/** "Show me the fix": proposed title, description and head tags for a saved scan (generated once, then cached). */
export async function getScanProposals(scanId: string): Promise<{ proposals: FreeAuditProposals; nothingToFix?: boolean; cached?: boolean }> {
  const res = await fetch(fnUrl("free-audit"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId, action: "proposals" }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      (data as { error?: { code?: string } })?.error?.code ?? "request_failed",
      (data as { error?: { message?: string } })?.error?.message ?? "Request failed. Please try again.",
    );
  }
  return data as { proposals: FreeAuditProposals; nothingToFix?: boolean; cached?: boolean };
}

export async function runFreeAudit(url: string): Promise<FreeAuditResult> {
  const res = await fetch(fnUrl("free-audit"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      (data as { error?: { code?: string } })?.error?.code ?? "request_failed",
      (data as { error?: { message?: string } })?.error?.message ?? "Request failed. Please try again.",
    );
  }
  return data as FreeAuditResult;
}

/** Read a saved free scan by id (share links, resuming after sign-in). */
export async function getFreeAudit(scanId: string): Promise<FreeAuditResult> {
  const res = await fetch(`${fnUrl("free-audit")}?id=${encodeURIComponent(scanId)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      (data as { error?: { code?: string } })?.error?.code ?? "request_failed",
      (data as { error?: { message?: string } })?.error?.message ?? "Request failed. Please try again.",
    );
  }
  return data as FreeAuditResult;
}
