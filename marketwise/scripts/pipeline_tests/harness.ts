/**
 * harness.ts — loads an edge-function bundle for unit testing.
 *
 * The bundle is a self-contained Deno module that calls Deno.serve(...) at
 * import time. To test its internals we:
 *   1. replace `Deno.serve(` with `const __unusedServe = (` so nothing serves
 *   2. append a globalThis.__PIPE__ exposure block for the internals under test
 *      (names that may not exist in every variant are guarded with typeof)
 *   3. write the patched module to /tmp and dynamically import it.
 *
 * Usage (invoked from unit_tests.ts):
 *   const mod = await loadBundle("/tmp/baseline_bundle.ts", "baseline");
 */
import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";

export async function loadBundle(bundlePath: string, variant: string) {
  const src = await Deno.readTextFile(bundlePath);
  const occurrences = src.split("Deno.serve(").length - 1;
  if (occurrences === 0) throw new Error(`no Deno.serve( found in ${bundlePath}`);
  let patched = src.split("Deno.serve(").join("const __unusedServe = (");
  patched = patched.replaceAll(
    "Deno.env.get(",
    "globalThis.Deno?.env?.get(",
  );

  const NAMES = [
    // shared (baseline + enhanced)
    "extractJson", "parseJson", "parseLlmJson", "zodErrorSummary",
    "computeSeoSignals", "buildChecklist", "extractPageSummary",
    "rankInternalLinks", "assembleReport", "clampScore", "wrapUntrusted",
    "clip", "systemPrompt", "profilePrompt", "auditPrompt", "marketPrompt",
    "strategyPrompt", "competitorsPickPrompt", "competitorsAnalyzePrompt",
    "renderSeoSignals", "STEP_IDS", "STEPS", "Finding", "AuditOut",
    "MarketOut", "StrategyOut", "ProductProfile", "Source", "Scores",
    // enhanced-only
    "blendSeoScore", "checklistScore", "topUpCompetitorPicks",
    "BOILERPLATE_SELECTORS", "stripBoilerplate",
  ];
  const exposures = NAMES.map((n) =>
    `  ${n.replace(/[^A-Za-z0-9_]/g, "")}: typeof ${n} !== "undefined" ? ${n} : undefined,`
  ).join("\n");
  patched += `\n(globalThis as Record<string, unknown>).__PIPE__ = {\n${exposures}\n};\n`;

  const outPath = new URL(`./pipeline_mod_${variant}.ts`, import.meta.url).pathname;
  await Deno.writeTextFile(outPath, patched);
  await import(`file://${outPath}?v=${Date.now()}`);
  const g = globalThis as Record<string, unknown>;
  return g.__PIPE__ as Record<string, unknown>;
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

if (import.meta.main) {
  const flags = parse(Deno.args);
  const pipe = await loadBundle(flags.bundle as string, flags.variant as string);
  console.log(
    "loaded",
    Object.keys(pipe).filter((k) => pipe[k] !== undefined).length,
    "symbols from",
    flags.variant,
  );
}
