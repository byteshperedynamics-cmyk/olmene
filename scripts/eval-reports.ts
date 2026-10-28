#!/usr/bin/env bun
/**
 * Score finished reports (src/lib/report-quality.ts) to compare prompt or
 * model changes. Read-only.
 *
 *   bun scripts/eval-reports.ts --db [--limit 20] [--since 2026-10-01]
 *       needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
 *   bun scripts/eval-reports.ts --dir path/to/reports   (one report JSON per file)
 *   --min 70   exit 1 when the average is below this (CI on a fixed set)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreReport } from "../src/lib/report-quality";
import type { ReportData } from "../src/lib/report-types";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

async function fromDb(limit: number, since: string | null): Promise<Array<{ id: string; report: ReportData }>> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --db");
  const q = new URLSearchParams({ select: "id,data,created_at", order: "created_at.desc", limit: String(limit) });
  if (since) q.set("created_at", `gte.${since}`);
  const res = await fetch(`${url}/rest/v1/reports?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`reports query failed: ${res.status}`);
  return ((await res.json()) as Array<{ id: string; data: ReportData }>).map((r) => ({ id: r.id, report: r.data }));
}

/** Bare report files, or scripts/pipeline-eval/run.ts output (the report under `report`). */
function fromDir(dir: string): Array<{ id: string; report: ReportData }> {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as ReportData | { report: ReportData | null };
    const report = "meta" in raw ? raw : raw.report;
    return report ? [{ id: f, report }] : [];
  });
}

const rows = args.includes("--db") ? await fromDb(Number(opt("--limit") ?? 20), opt("--since")) : opt("--dir") ? fromDir(opt("--dir")!) : [];
if (!rows.length) {
  console.error("No reports. Use --db or --dir <folder>.");
  process.exit(1);
}
let total = 0;
for (const { id, report } of rows) {
  const q = scoreReport(report);
  total += q.score;
  console.log(`${String(q.score).padStart(3)}  ${report.meta?.siteUrl ?? id}`);
  for (const i of q.issues) console.log(`       -${i.cost}  ${i.check}: ${i.detail}`);
}
const avg = Math.round(total / rows.length);
console.log(`\nAverage ${avg}/100 over ${rows.length} report(s).`);
const min = opt("--min");
if (min && avg < Number(min)) process.exit(1);
