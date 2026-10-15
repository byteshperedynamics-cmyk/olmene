import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/ai-visibility — the buyer questions Olmene asks an AI
 * assistant with web search every week, and the last 12 weekly results.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  const db = getServiceDb();
  const { data: site } = await db.from("sites").select("id, user_id, host, ai_prompts, ai_last, ai_next_check_at, competitors").eq("id", id).maybeSingle();
  if (!site || site.user_id !== actor.ownerId) return ERR.notFound("site");
  const { data: runs } = await db.from("ai_visibility_runs").select("id, engine, mention_share, cite_share, competitor_mentions, results, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(12);
  return NextResponse.json({ site: { id: site.id, host: site.host, questions: site.ai_prompts ?? [], nextCheckAt: site.ai_next_check_at, competitors: site.competitors }, runs: runs ?? [] });
}

/** PUT /api/sites/[id]/ai-visibility { questions: string[] } — use your own buyer questions (3–10). */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  let body: { questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const questions = Array.isArray(body.questions)
    ? [...new Set(body.questions.filter((q): q is string => typeof q === "string").map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => q.length >= 8 && q.length <= 160))].slice(0, 10)
    : [];
  if (questions.length < 3) return ERR.badRequest("Add 3 to 10 questions (8–160 characters each).");
  const { data } = await getServiceDb().from("sites").update({ ai_prompts: questions, ai_next_check_at: new Date().toISOString() }).eq("id", id).eq("user_id", actor.ownerId).select("id").maybeSingle();
  if (!data) return ERR.notFound("site");
  return NextResponse.json({ ok: true, questions });
}
