#!/usr/bin/env node
/**
 * SQL tests: builds a scratch database from supabase/tests/stub-supabase.sql
 * (the bits of Supabase our migrations use) plus every migration in order,
 * then runs each supabase/tests/*.test.sql in its own transaction. A test
 * fails by raising an exception.
 *
 * Needs psql and a Postgres you can create databases on; point at it with
 * the usual PGHOST / PGPORT / PGUSER / PGPASSWORD. KEEP_DB=1 keeps the
 * scratch database for poking around.
 *
 *   npm run test:sql
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const db = `olmene_sqltest_${process.pid}`;

// Things production has that no migration creates (applied by hand before
// migrations were tracked). Added just before the file that needs them.
const BEFORE = {
  "20261010_plans_v2_rows.sql": "alter table public.plans add column if not exists one_time boolean not null default false;",
};
// Extensions a plain Postgres doesn't ship; the stub provides their functions.
const UNAVAILABLE = /^\s*create\s+extension\s+if\s+not\s+exists\s+"?(pg_cron|pg_net|supabase_vault)"?\s*;\s*$/gim;

function psql(args, input, database = "postgres") {
  const r = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, ...args], {
    input,
    encoding: "utf8",
    env: { PGUSER: "postgres", ...process.env },
  });
  if (r.error) throw r.error;
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function firstError(out) {
  return out.split("\n").find((l) => /ERROR|FATAL/.test(l))?.trim() ?? out.trim().split("\n").at(-1) ?? "";
}

const created = psql(["-c", `create database ${db}`]);
if (!created.ok) {
  console.error(`✗ can't create a scratch database: ${firstError(created.out)}`);
  console.error("  Start a local Postgres and set PGHOST/PGPORT/PGUSER (see the header of this file).");
  process.exit(2);
}

let failed = 0;
try {
  const stub = psql(["-1"], readFileSync(`${root}supabase/tests/stub-supabase.sql`, "utf8"), db);
  if (!stub.ok) throw new Error(`stub: ${firstError(stub.out)}`);

  const migrations = readdirSync(`${root}supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) {
    if (BEFORE[f]) {
      const fix = psql(["-1"], BEFORE[f], db);
      if (!fix.ok) throw new Error(`before ${f}: ${firstError(fix.out)}`);
    }
    const sql = readFileSync(`${root}supabase/migrations/${f}`, "utf8").replace(UNAVAILABLE, "");
    const r = psql(["-1"], sql, db);
    if (!r.ok) throw new Error(`migration ${f}: ${firstError(r.out)}`);
  }
  // Every migration again: they must be safe to run twice.
  for (const f of migrations.filter((m) => m >= "20261021")) {
    const sql = readFileSync(`${root}supabase/migrations/${f}`, "utf8").replace(UNAVAILABLE, "");
    const r = psql(["-1"], sql, db);
    if (!r.ok) throw new Error(`migration ${f} (second run): ${firstError(r.out)}`);
  }
  console.log(`✓ ${migrations.length} migrations applied (and the recent ones twice)`);

  const tests = readdirSync(`${root}supabase/tests`).filter((f) => f.endsWith(".test.sql")).sort();
  for (const f of tests) {
    const r = psql(["-1"], readFileSync(`${root}supabase/tests/${f}`, "utf8"), db);
    if (r.ok) console.log(`✓ ${f}`);
    else {
      failed++;
      console.error(`✗ ${f}: ${firstError(r.out)}`);
    }
  }
} catch (e) {
  failed++;
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
} finally {
  if (process.env.KEEP_DB !== "1") psql(["-c", `drop database if exists ${db}`]);
  else console.log(`kept database ${db}`);
}
process.exit(failed ? 1 : 0);
