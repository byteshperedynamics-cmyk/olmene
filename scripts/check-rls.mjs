#!/usr/bin/env node
/**
 * Every table in the public schema must have row level security turned on
 * (in the same or a later migration). Without RLS, the anon key in the
 * browser could read the table. Runs in CI: `npm run check:rls`.
 */
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const created = new Map();
const secured = new Set();
for (const f of files) {
  const sql = readFileSync(new URL(f, dir), "utf8").replace(/--[^\n]*/g, "");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
    if (!created.has(m[1])) created.set(m[1], f);
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi)) secured.add(m[1]);
}
// Tables that are deliberately public or not in the public schema.
const EXEMPT = new Set((process.env.RLS_EXEMPT ?? "").split(",").filter(Boolean));
const missing = [...created.keys()].filter((t) => !secured.has(t) && !EXEMPT.has(t));
if (missing.length) {
  for (const t of missing) console.error(`✗ ${t} (created in ${created.get(t)}) has no "enable row level security"`);
  process.exit(1);
}
console.log(`✓ ${created.size} tables, all with row level security.`);
