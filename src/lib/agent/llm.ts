/**
 * LLM access for agent copy drafting. Reuses the same model routing as the
 * analysis pipeline (llm_models table → vertex/google/* on Vertex AI,
 * google/* on the Gemini API, mistral/* on Mistral (EU fallback), else GLM)
 * with a
 * SEPARATE budget namespace (agent:llm:YYYY-MM-DD) so agent usage can never
 * starve report generation (user decision 2026-09-29).
 *
 * Injection defense (spec §5.3): report data (which contains crawled,
 * untrusted page content) is sent as USER-role data with explicit framing.
 * Model output is parsed as JSON and used ONLY as copy strings, which are
 * length-checked and HTML-escaped at insertion time. Model output never
 * influences tool choice, paths, or actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { agentLlmDailyCap, getEnv } from "./env";
import { redactString } from "./redact";

export class LlmBudgetExceeded extends Error {
  constructor() {
    super("agent LLM daily budget exhausted");
    this.name = "LlmBudgetExceeded";
  }
}

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmPort {
  /** Draft copy as JSON. Throws on repeated failure; caller degrades gracefully. */
  draftCopy(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<unknown>;
}

interface ModelRow {
  id: string;
  priority: number;
  supports_json_schema: boolean;
  active: boolean;
}

const GLM_BASE = getEnv("GLM_API_BASE") ?? "https://api.z.ai/api/paas/v4/chat/completions";
const MISTRAL_BASE = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_PREFIX = "mistral/";
const GEMINI_BASE =
  getEnv("GEMINI_API_BASE") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function consumeBudget(db: SupabaseClient, amount: number): Promise<boolean> {
  const key = `agent:llm:${new Date().toISOString().slice(0, 10)}`;
  const { data, error } = await db.rpc("consume_budget", {
    p_key: key,
    p_amount: amount,
    p_cap: agentLlmDailyCap(),
  });
  if (error) throw new Error(`consume_budget failed: ${error.message}`);
  return data === true;
}

/** Gemini on Vertex AI (Google Cloud credits): model ids are "vertex/google/<model>". */
const VERTEX_PREFIX = "vertex/";

function vertexUrl(): string | null {
  const project = getEnv("VERTEX_PROJECT");
  if (!project) return null;
  const location = getEnv("VERTEX_LOCATION") ?? "global";
  return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;
}

/** The env key a model id needs (null when the id names no known provider). */
export function keyNameFor(model: string): string {
  if (model.startsWith(VERTEX_PREFIX)) return "VERTEX_API_KEY";
  if (model.startsWith("google/")) return "GEMINI_API_KEY";
  if (model.startsWith(MISTRAL_PREFIX)) return "MISTRAL_API_KEY";
  return "GLM_API_KEY";
}

interface CallResult {
  content: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | null;
}

async function callModel(model: string, messages: LlmMessage[], maxTokens: number, timeoutMs = 45_000): Promise<CallResult> {
  const isVertex = model.startsWith(VERTEX_PREFIX);
  const isGemini = model.startsWith("google/") || isVertex;
  const isMistral = model.startsWith(MISTRAL_PREFIX);
  const keyName = keyNameFor(model);
  const apiKey = getEnv(keyName);
  if (!apiKey) throw new Error(`${keyName} not configured`);
  const url = isVertex ? vertexUrl() : isGemini ? GEMINI_BASE.replace("{model}", model.replace("google/", "")) : isMistral ? MISTRAL_BASE : GLM_BASE;
  if (!url) throw new Error("VERTEX_PROJECT not configured");
  // Vertex wants "google/<model>"; AI Studio's endpoint wants the bare model name.
  const apiModel = isVertex ? model.slice(VERTEX_PREFIX.length) : isGemini ? model.replace("google/", "") : isMistral ? model.slice(MISTRAL_PREFIX.length) : model;

  // Gemini 3.x flash models think first and the hidden reasoning tokens count
  // against max_tokens, so a 900-token copy request came back empty. Same
  // treatment as the analysis engine: low reasoning + headroom; flash-lite's
  // request stays as is (it rejects reasoning_effort "none").
  const thinking = isGemini && !model.includes("lite");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        // Vertex authorization keys are rejected as Bearer tokens.
        ...(isVertex ? { "x-goog-api-key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model: apiModel,
        messages,
        max_tokens: maxTokens + (thinking ? 6000 : 0),
        temperature: 0.3,
        ...(thinking ? { reasoning_effort: "low" } : {}),
        ...(isGemini || isMistral ? {} : { thinking: { type: "disabled" } }),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`upstream ${res.status}: ${redactString(body.slice(0, 160))}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: CallResult["usage"] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty completion");
    return { content, usage: data.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse the first JSON object from a model response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Production LLM port backed by the llm_models routing table. */
export function createLlmPort(db: SupabaseClient): LlmPort {
  return {
    async draftCopy(systemPrompt, userPrompt, maxTokens) {
      if (!(await consumeBudget(db, 1))) {
        throw new LlmBudgetExceeded();
      }
      const { data: rows, error } = await db
        .from("llm_models")
        .select("id, priority, supports_json_schema, active")
        .eq("active", true)
        .order("priority", { ascending: true })
        .limit(8);
      // Only models whose provider key is configured on this Worker.
      const models = ((rows as ModelRow[] | null) ?? []).filter((m) => !!getEnv(keyNameFor(m.id))).slice(0, 4);
      if (error || models.length === 0) {
        throw new Error("no active models in llm_models");
      }
      const messages: LlmMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      let lastErr: unknown = null;
      for (const m of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const started = Date.now();
          try {
            const { content, usage } = await callModel(m.id, messages, maxTokens);
            await recordUsage(db, m.id, started, true, usage);
            return extractJson(content);
          } catch (e) {
            lastErr = e;
            await recordUsage(db, m.id, started, false, null, e instanceof Error ? e.message : String(e));
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("all models failed");
    },
  };
}

/** Usage ledger row (public.engine_usage) for one agent AI call. Best-effort. */
async function recordUsage(
  db: SupabaseClient,
  model: string,
  started: number,
  ok: boolean,
  usage: CallResult["usage"],
  error?: string,
): Promise<void> {
  try {
    await db.from("engine_usage").insert({
      kind: "llm",
      source: "agent",
      step: "copy",
      model,
      provider: model.split("/")[0],
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
      latency_ms: Date.now() - started,
      ok,
      error: error ? redactString(error).slice(0, 300) : null,
    });
  } catch {
    /* bookkeeping only */
  }
}
