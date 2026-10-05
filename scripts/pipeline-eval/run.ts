/**
 * Local, purchase-free driver for the advance-analysis engine.
 *
 * Loads supabase/functions/advance-analysis/index.ts with Deno.serve stubbed,
 * swaps the database for an in-memory fake (no rows written anywhere), and
 * runs every step in order exactly like executeOneUnit/runStep do, with the
 * real Gemini + Tavily APIs. Writes the report + every step output to JSON.
 *
 * usage:
 *   GEMINI_API_KEY=… TAVILY_API_KEY=… [MODELS=id,id] \
 *     deno run -A scripts/pipeline-eval/run.ts https://site.com out.json [goal]
 */
const [siteUrl, outFile, goal = "first_customers"] = Deno.args;
if (!siteUrl || !outFile) {
  console.error("usage: run.ts <siteUrl> <outFile> [goal]");
  Deno.exit(2);
}
const ENGINE = Deno.env.get("ENGINE") ?? new URL("../../supabase/functions/advance-analysis/index.ts", import.meta.url).pathname;
let src = await Deno.readTextFile(ENGINE);
src = src.replace("Deno.serve(", "const __noServe = (");
src += `\nexport { runCrawl, runProfile, runResearch, runCompetitorsPick, runCompetitorsExtract, runCompetitorsAnalyze, runAudit, runMarket, runStrategy, runAssemble };\n`;
const tmp = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tmp, src);
const E = await import(`file://${tmp}`);

// Production order (llm_models.priority) unless overridden.
const MODELS = (Deno.env.get("MODELS") ?? "google/gemini-3.5-flash-lite,google/gemini-3.6-flash,google/gemini-3.5-flash")
  .split(",").map((id, i) => ({ id, priority: i + 1, supports_json_schema: false }));

// In-memory Supabase stand-in: llm_models comes from MODELS, budgets always
// allow, updates/inserts are no-ops.
function builder(table: string) {
  const self: Record<string, unknown> = {};
  const ret = (data: unknown) => Promise.resolve({ data, error: null });
  for (const m of ["select", "eq", "order", "update", "limit", "gte", "in", "not"]) self[m] = () => self;
  self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    (table === "llm_models" ? ret(MODELS) : ret(null)).then(res, rej);
  self.maybeSingle = () => ret(null);
  self.insert = () => ({ select: () => ({ single: () => ret({ id: crypto.randomUUID() }) }) });
  return self;
}
const supabase = { from: builder, rpc: () => Promise.resolve({ data: true, error: null }) };
const env = {
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") ?? "",
  TAVILY_API_KEY: Deno.env.get("TAVILY_API_KEY") ?? "",
  GLM_API_KEY: Deno.env.get("GLM_API_KEY") ?? "", GLM_DAILY_CAP: "100000", TAVILY_MONTHLY_CAP: "100000",
  APP_URL: "https://olmene.com", APP_NAME: "Olmene",
};
const job = {
  id: crypto.randomUUID(), user_id: "local-eval", site_url: siteUrl,
  input: { siteUrl, goal, language: "English", knownCompetitors: [] as string[] },
  step_outputs: {} as Record<string, unknown>, step_log: [],
};
const o = job.step_outputs;
const timing: Record<string, number> = {};
const models: Record<string, string[]> = {};
// Production re-queues a failed step and retries it up to 3 times (30 s
// backoff, handleStepError); mirror that so transient 503s don't count as
// pipeline failures.
async function step(name: string, fn: () => Promise<{ output: unknown; models?: string[] }>) {
  const t0 = Date.now();
  let r: { output: unknown; models?: string[] } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      r = await fn();
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.error(`  ↻ ${name} attempt ${attempt} failed (${String(e).slice(0, 80)}) — retrying in 30s`);
      await new Promise((res) => setTimeout(res, 30_000));
    }
  }
  timing[name] = Date.now() - t0;
  models[name] = r.models ?? [];
  o[name] = r.output;
  console.error(`  ✓ ${name} ${(timing[name] / 1000).toFixed(1)}s ${models[name].join(",")}`);
}
const t0 = Date.now();
try {
  await step("crawl", () => E.runCrawl(job, supabase, env));
  await step("profile", async () => { const r = await E.runProfile(job, supabase, env, o.crawl); return { output: r.profile, models: r.models }; });
  await step("research", () => E.runResearch(job, supabase, env, o.profile));
  await step("competitors_pick", async () => (await E.runCompetitorsPick(job, supabase, env, o.profile, o.research)).outcome);
  await step("competitors_extract", () => E.runCompetitorsExtract(job, supabase, env, o.competitors_pick));
  await step("competitors_analyze", async () => {
    const r = await E.runCompetitorsAnalyze(job, supabase, env, o.profile, o.competitors_extract, o.research);
    return { output: { competitors: r.competitors }, models: r.models };
  });
  await step("audit", async () => { const r = await E.runAudit(job, supabase, env, o.profile, o.crawl, o.research); return { output: r.audit, models: r.models }; });
  await step("market", async () => { const r = await E.runMarket(job, supabase, env, o.profile, o.research); return { output: r.market, models: r.models }; });
  await step("strategy", async () => {
    const comps = (o.competitors_analyze as { competitors: unknown }).competitors;
    const r = await E.runStrategy(job, supabase, env, o.profile, o.market, comps, o.audit, o.research);
    return { output: r.strategy, models: r.models };
  });
  const { report, title } = await E.runAssemble(job, [...new Set(Object.values(models).flat())]);
  await Deno.writeTextFile(outFile, JSON.stringify({ siteUrl, title, totalMs: Date.now() - t0, timing, models, report, stepOutputs: o }, null, 2));
  console.error(`DONE ${siteUrl} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${outFile}`);
} catch (e) {
  await Deno.writeTextFile(outFile, JSON.stringify({ siteUrl, failed: String(e), timing, models, stepOutputs: o }, null, 2));
  console.error(`FAILED ${siteUrl}: ${e}`);
  Deno.exit(1);
} finally {
  await Deno.remove(tmp).catch(() => {});
}
