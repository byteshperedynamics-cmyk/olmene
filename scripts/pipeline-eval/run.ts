/**
 * Local, purchase-free driver for the advance-analysis engine.
 *
 * Loads supabase/functions/advance-analysis/index.ts with Deno.serve stubbed
 * and runs the production dispatcher (executeOneUnit: every step in order,
 * with the same retries and backoff as the edge function) against an
 * in-memory database, so no rows are written anywhere. The LLM and research
 * calls are real (Gemini + Tavily). Writes the report and every step output
 * to JSON; `report` is the ReportData that eval-reports and agent-eval read.
 *
 * usage (from the repo root):
 *   GEMINI_API_KEY=… TAVILY_API_KEY=… [MODELS=id,id] \
 *     deno run -A --config supabase/functions/deno.json scripts/pipeline-eval/run.ts https://site.com out.json [goal] [language]
 */
const [siteUrl, outFile, goal = "first_customers", language = "English"] = Deno.args;
if (!siteUrl || !outFile) {
  console.error("usage: run.ts <siteUrl> <outFile> [goal] [language]");
  Deno.exit(2);
}
const ENGINE_DIR = Deno.env.get("ENGINE_DIR") ?? new URL("../../supabase/functions/advance-analysis/", import.meta.url).pathname;
// Keep the patched copy next to the original so its relative imports
// (../_shared, ../free-audit, ./quality.ts) still resolve.
let src = await Deno.readTextFile(`${ENGINE_DIR}/index.ts`);
src = src.replace("Deno.serve(", "const __noServe = (");
src += `\nexport { executeOneUnit };\n`;
const tmp = `${ENGINE_DIR}/.__eval_${crypto.randomUUID().slice(0, 8)}.ts`;
await Deno.writeTextFile(tmp, src);

// Production uses Vertex; these ids go through the Gemini API key instead.
const MODELS = (Deno.env.get("MODELS") ?? "google/gemini-3.6-flash,google/gemini-3.5-flash-lite")
  .split(",").map((id, i) => ({ id, priority: i + 1, supports_json_schema: false }));

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const job: Row = {
  id: crypto.randomUUID(), user_id: "local-eval", site_url: siteUrl, status: "queued", current_step: "crawl",
  attempts: 0, step_outputs: {}, step_log: [],
  input: { siteUrl, goal, language, knownCompetitors: [] as string[] },
};
const tables: Record<string, Row[]> = {};

// In-memory Supabase stand-in: job updates land on `job`, inserts are kept per
// table (engine_usage gives the token counts), llm_models comes from MODELS
// and every budget allows.
function builder(table: string) {
  let op = "select";
  let payload: Row | null = null;
  const self: Row = {};
  for (const m of ["select", "eq", "gt", "gte", "lt", "order", "limit", "in", "not", "is", "neq", "match", "filter"]) self[m] = () => self;
  const result = () => {
    if (op === "update" && table === "analysis_jobs") Object.assign(job, payload);
    if (op === "insert" || op === "upsert") (tables[table] ??= []).push(payload ?? {});
    if (op === "select" && table === "llm_models") return MODELS;
    if (op === "select" && table === "llm_model_health") return [];
    if (op === "insert" && table === "reports") return { id: (payload!.id ??= crypto.randomUUID()) };
    return null;
  };
  self.update = (p: Row) => ((op = "update"), (payload = p), self);
  self.insert = (p: Row) => ((op = "insert"), (payload = p), self);
  self.upsert = (p: Row) => ((op = "upsert"), (payload = p), self);
  self.delete = () => ((op = "delete"), self);
  self.single = () => Promise.resolve({ data: result(), error: null });
  self.maybeSingle = self.single;
  self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(res, rej);
  return self;
}
const supabase = { from: builder, rpc: (name: string) => Promise.resolve({ data: name === "consume_budget" ? true : null, error: null }) };
const env = {
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") ?? "",
  TAVILY_API_KEY: Deno.env.get("TAVILY_API_KEY") ?? "",
  GLM_API_KEY: Deno.env.get("GLM_API_KEY") ?? "", GLM_DAILY_CAP: "100000", TAVILY_MONTHLY_CAP: "100000",
  APP_URL: "https://olmene.com", APP_NAME: "Olmene",
};

const t0 = Date.now();
const timing: Record<string, number> = {};
try {
  const E = await import(`file://${tmp}`);
  for (let guard = 0; guard < 60 && !["completed", "failed"].includes(job.status); guard++) {
    const step = job.current_step;
    const s0 = Date.now();
    const r = await E.executeOneUnit(supabase, env, structuredClone(job));
    timing[step] = (timing[step] ?? 0) + (Date.now() - s0);
    const entry = job.step_log.find((e: Row) => e.step === step);
    console.error(`  ${r.status === "queued" ? "↻" : "✓"} ${step} ${((Date.now() - s0) / 1000).toFixed(1)}s ${entry?.model ?? ""}${entry?.error ? ` ${entry.error.slice(0, 120)}` : ""}`);
    if (r.status === "queued") {
      // Production waits for the backoff or the budget reset; locally, at most 30 s.
      const wait = Math.min(Math.max(0, new Date(job.locked_until ?? 0).getTime() - Date.now()), 30_000);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  const stored = tables.reports?.[0];
  const usage = tables.engine_usage ?? [];
  const sum = (k: string) => usage.reduce((a, u) => a + (u[k] ?? 0), 0);
  await Deno.writeTextFile(outFile, JSON.stringify({
    siteUrl, status: job.status, error: job.error ?? null, totalMs: Date.now() - t0, timing, stepLog: job.step_log,
    usage: { calls: usage.length, failed: usage.filter((u) => u.ok === false).length, promptTokens: sum("prompt_tokens"), completionTokens: sum("completion_tokens") },
    title: stored?.title ?? null, models: stored?.models_used ?? [], report: stored?.data ?? null, stepOutputs: job.step_outputs,
  }, null, 2));
  console.error(`${String(job.status).toUpperCase()} ${siteUrl} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${outFile}`);
  if (job.status !== "completed") Deno.exitCode = 1;
} finally {
  await Deno.remove(tmp).catch(() => {});
}
