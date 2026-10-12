/**
 * Engine bookkeeping shared by the edge functions:
 *  - recordUsage: one row per AI call / research credit spend / page render
 *    in public.engine_usage, so cost per report and per customer is known
 *    (the providers return token counts; the engine used to drop them).
 *  - recordOps: operational events (public.ops_events) for failures worth a
 *    look; the health-watch function turns new errors into an alert email.
 *  - enqueueNotification: customer emails go through an outbox
 *    (public.notifications); the notify function sends them.
 * All three are best-effort: bookkeeping never breaks the work it describes.
 */
// deno-lint-ignore-file no-explicit-any
type Db = { from: (t: string) => any };

export interface UsageRow {
  kind: "llm" | "research" | "render";
  source: "analysis" | "agent" | "scan" | "monitor";
  job_id?: string | null;
  agent_job_id?: string | null;
  user_id?: string | null;
  step?: string | null;
  provider?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  reasoning_tokens?: number | null;
  cached_tokens?: number | null;
  units?: number | null;
  latency_ms?: number | null;
  ok?: boolean;
  error?: string | null;
}

export async function recordUsage(db: Db, row: UsageRow): Promise<void> {
  try {
    await db.from("engine_usage").insert({ ok: true, ...row, error: row.error ? String(row.error).slice(0, 300) : null });
  } catch {
    /* bookkeeping only */
  }
}

/** Token fields from an OpenAI-compatible `usage` object (Vertex, Gemini, Mistral, GLM…). */
export function tokensFromUsage(usage: any): Pick<UsageRow, "prompt_tokens" | "completion_tokens" | "reasoning_tokens" | "cached_tokens"> {
  if (!usage || typeof usage !== "object") return {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  return {
    prompt_tokens: n(usage.prompt_tokens),
    completion_tokens: n(usage.completion_tokens),
    reasoning_tokens: n(usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens),
    cached_tokens: n(usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens),
  };
}

export async function recordOps(
  db: Db,
  source: string,
  message: string,
  detail: Record<string, unknown> = {},
  severity: "error" | "warn" | "info" = "error",
): Promise<void> {
  try {
    await db.from("ops_events").insert({ source, severity, message: message.slice(0, 500), detail });
  } catch {
    /* logging must never take the caller down */
  }
}

export async function enqueueNotification(
  db: Db,
  n: { userId: string; kind: string; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  try {
    await db
      .from("notifications")
      .upsert({ user_id: n.userId, kind: n.kind, payload: n.payload, dedupe_key: n.dedupeKey }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  } catch {
    /* a missing email must never fail a report */
  }
}
