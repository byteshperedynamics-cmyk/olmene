"use client";

import { fnUrl } from "./config";
import { getSupabase } from "./supabase";

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
  return post("start-analysis", input);
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
    hasStructuredData: boolean;
    hasPricingPage: boolean;
  };
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
