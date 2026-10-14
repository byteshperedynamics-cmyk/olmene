/**
 * Small AI calls outside the report pipeline (engine v2): the free scan's
 * proposed fixes, AI-visibility prompts and answers. Same models as reports
 * (public.llm_models, priority order, only providers with a key), same daily
 * budget counter (consume_budget "llm:<day>") and the same usage ledger, but
 * a short timeout and no retries beyond trying the next model: these calls
 * are optional extras and must never hold a request for long.
 *
 * groundedAnswer() asks Gemini on Vertex with Google Search grounding and
 * returns the answer text plus the cited web sources; it's how AI visibility
 * measures whether an assistant mentions or cites a site.
 */
// deno-lint-ignore-file no-explicit-any
import { recordUsage, tokensFromUsage, type UsageRow } from "./ledger.ts";

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

interface Provider {
  name: string;
  prefix: string;
  url: () => string | null;
  key: () => string | undefined;
  header: "bearer" | "x-goog-api-key";
}

const env = (k: string) => Deno.env.get(k);

const PROVIDERS: Provider[] = [
  {
    name: "vertex",
    prefix: "vertex/",
    url: () => env("VERTEX_PROJECT") ? `https://aiplatform.googleapis.com/v1/projects/${env("VERTEX_PROJECT")}/locations/${env("VERTEX_LOCATION") || "global"}/endpoints/openapi/chat/completions` : null,
    key: () => env("VERTEX_API_KEY"),
    header: "x-goog-api-key",
  },
  { name: "google", prefix: "google/", url: () => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: () => env("GEMINI_API_KEY"), header: "bearer" },
  { name: "mistral", prefix: "mistral/", url: () => "https://api.mistral.ai/v1/chat/completions", key: () => env("MISTRAL_API_KEY"), header: "bearer" },
];

function providerOf(id: string): Provider | null {
  return PROVIDERS.find((p) => id.startsWith(p.prefix)) ?? null;
}

export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("not JSON");
  }
}

export interface SmallCallOptions {
  step: string;
  source: UsageRow["source"];
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  userId?: string | null;
  /** Validate/normalise the parsed JSON; throw to try the next model. */
  validate: (v: unknown) => unknown;
}

/** Active models in priority order whose provider has a key. */
async function models(db: Db): Promise<Array<{ id: string; provider: Provider }>> {
  const { data } = await db.from("llm_models").select("id, priority").eq("active", true).order("priority", { ascending: true });
  return ((data ?? []) as Array<{ id: string }>)
    .map((m) => ({ id: m.id, provider: providerOf(m.id) }))
    .filter((m): m is { id: string; provider: Provider } => !!m.provider && !!m.provider.key() && !!m.provider.url());
}

async function withinDailyBudget(db: Db): Promise<boolean> {
  const cap = Number(env("GLM_DAILY_CAP") ?? 0);
  if (!cap) return true;
  try {
    const { data, error } = await db.rpc("consume_budget", { p_key: `llm:${new Date().toISOString().slice(0, 10)}`, p_amount: 1, p_cap: cap });
    return !error && data === true;
  } catch {
    return true;
  }
}

/** One JSON answer from the first model that gives a valid one (max 2 models). Null when none can. */
export async function smallJsonCall<T>(db: Db, opts: SmallCallOptions): Promise<{ data: T; model: string } | null> {
  const list = (await models(db)).slice(0, 2);
  for (const m of list) {
    if (!(await withinDailyBudget(db))) return null;
    const started = Date.now();
    const thinking = m.id.includes("gemini") && !m.id.includes("lite");
    try {
      const res = await fetch(m.provider.url()!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(m.provider.header === "bearer" ? { Authorization: `Bearer ${m.provider.key()}` } : { "x-goog-api-key": m.provider.key()! }),
        },
        body: JSON.stringify({
          model: m.id.slice(m.provider.prefix.length),
          temperature: opts.temperature ?? 0.3,
          max_tokens: (opts.maxTokens ?? 800) + (thinking ? 2000 : 0),
          ...(thinking ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      const payload = await res.json().catch(() => null);
      const tokens = tokensFromUsage(payload?.usage);
      if (!res.ok) {
        await recordUsage(db, { kind: "llm", source: opts.source, step: opts.step, provider: m.provider.name, model: m.id, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: false, error: `upstream ${res.status}`, ...tokens });
        continue;
      }
      const content = payload?.choices?.[0]?.message?.content ?? "";
      let data: T;
      try {
        data = opts.validate(parseJsonLoose(content)) as T;
      } catch (e) {
        await recordUsage(db, { kind: "llm", source: opts.source, step: opts.step, provider: m.provider.name, model: m.id, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: false, error: `invalid: ${(e as Error).message}`, ...tokens });
        continue;
      }
      await recordUsage(db, { kind: "llm", source: opts.source, step: opts.step, provider: m.provider.name, model: m.id, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: true, ...tokens });
      return { data, model: m.id };
    } catch (e) {
      await recordUsage(db, { kind: "llm", source: opts.source, step: opts.step, provider: m.provider.name, model: m.id, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: false, error: `network: ${(e as Error).message}` });
    }
  }
  return null;
}

// ─── Grounded answers (AI visibility) ────────────────────────────────────

export interface GroundedAnswer {
  text: string;
  /** Web pages the answer cites (Google Search grounding chunks). */
  sources: Array<{ uri: string; title: string | null; domain: string | null }>;
  queries: string[];
  model: string;
}

/**
 * Gemini on Vertex with the Google Search tool (native generateContent API:
 * the OpenAI-compatible endpoint doesn't return grounding metadata). Needs
 * VERTEX_PROJECT + VERTEX_API_KEY. Model: AI_VISIBILITY_MODEL or the first
 * active Vertex Gemini row.
 */
export async function groundedAnswer(db: Db, question: string, opts: { userId?: string | null; timeoutMs?: number } = {}): Promise<GroundedAnswer | null> {
  const project = env("VERTEX_PROJECT");
  const key = env("VERTEX_API_KEY");
  if (!project || !key) return null;
  let model = env("AI_VISIBILITY_MODEL") ?? "";
  if (!model) {
    const list = await models(db);
    model = list.find((m) => m.provider.name === "vertex" && m.id.includes("gemini"))?.id.replace(/^vertex\/google\//, "") ?? "";
  }
  if (!model) return null;
  if (!(await withinDailyBudget(db))) return null;
  const location = env("VERTEX_LOCATION") || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const started = Date.now();
  try {
    const res = await fetch(`https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 40_000),
    });
    const body = await res.json().catch(() => null) as any;
    const usage = body?.usageMetadata;
    const tokens = usage ? { prompt_tokens: usage.promptTokenCount ?? null, completion_tokens: usage.candidatesTokenCount ?? null, reasoning_tokens: usage.thoughtsTokenCount ?? null, cached_tokens: usage.cachedContentTokenCount ?? null } : {};
    if (!res.ok || !body) {
      await recordUsage(db, { kind: "llm", source: "monitor", step: "ai-visibility", provider: "vertex", model: `vertex/google/${model}`, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: false, error: `upstream ${res.status}` });
      return null;
    }
    const cand = body.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
    const meta = cand?.groundingMetadata ?? {};
    const sources = ((meta.groundingChunks ?? []) as any[])
      .map((ch) => ch.web)
      .filter(Boolean)
      .map((w: any) => ({ uri: String(w.uri ?? ""), title: w.title ? String(w.title) : null, domain: w.domain ? String(w.domain) : (w.title && /\./.test(w.title) ? String(w.title) : null) }));
    await recordUsage(db, { kind: "llm", source: "monitor", step: "ai-visibility", provider: "vertex", model: `vertex/google/${model}`, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: true, ...tokens });
    return { text, sources, queries: (meta.webSearchQueries ?? []).map(String), model: `vertex/google/${model}` };
  } catch (e) {
    await recordUsage(db, { kind: "llm", source: "monitor", step: "ai-visibility", provider: "vertex", model: `vertex/google/${model}`, user_id: opts.userId ?? null, latency_ms: Date.now() - started, ok: false, error: `network: ${(e as Error).message}` });
    return null;
  }
}
