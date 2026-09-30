/**
 * LLM access for agent copy drafting. Reuses the same model routing as the
 * analysis pipeline (llm_models table → google/* on Gemini, else GLM) with a
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

async function callModel(model: string, messages: LlmMessage[], maxTokens: number, timeoutMs = 45_000): Promise<string> {
  const isGemini = model.startsWith("google/");
  const apiKey = isGemini ? getEnv("GEMINI_API_KEY") : getEnv("GLM_API_KEY");
  if (!apiKey) throw new Error(`${isGemini ? "GEMINI_API_KEY" : "GLM_API_KEY"} not configured`);
  const url = isGemini ? GEMINI_BASE.replace("{model}", model.replace("google/", "")) : GLM_BASE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: isGemini ? model.replace("google/", "") : model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        ...(isGemini ? {} : { thinking: { type: "disabled" } }),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`upstream ${res.status}: ${redactString(body.slice(0, 160))}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty completion");
    return content;
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
      const { data: models, error } = await db
        .from("llm_models")
        .select("id, priority, supports_json_schema, active")
        .eq("active", true)
        .order("priority", { ascending: true })
        .limit(4);
      if (error || !models || models.length === 0) {
        throw new Error("no active models in llm_models");
      }
      const messages: LlmMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      let lastErr: unknown = null;
      for (const m of models as ModelRow[]) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const raw = await callModel(m.id, messages, maxTokens);
            return extractJson(raw);
          } catch (e) {
            lastErr = e;
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("all models failed");
    },
  };
}
