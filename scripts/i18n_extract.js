#!/usr/bin/env node
/**
 * Cross-checks dictionary keys against actual usage in the source tree.
 *
 * Usage: node scripts/i18n_extract.js
 *
 * Extracts every string literal used as a translation key:
 *   - t("key", …) / t('key', …)
 *   - <Tx k="key" …>
 *   - usePageMeta("titleKey", "descKey")
 *   - every quoted literal inside src/i18n/keys.ts (enum → key maps)
 *
 * Then reports keys used in code but missing from en.json, and keys in
 * en.json that nothing references (usually a bug — or dead weight).
 */
const fs = require("node:fs");
const path = require("node:path");

const SRC = "/home/z/my-project/src";
const EN_UI = "/home/z/my-project/src/i18n/dictionaries/en.json";
const EN_SR = "/home/z/my-project/src/i18n/sample-report/en.json";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(e.name) && !p.includes("src/i18n/")) out.push(p);
  }
  return out;
}

const used = new Set();
const add = (k) => k && used.add(k);

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["']([^"']+)["']/g)) add(m[1]);
  for (const m of src.matchAll(/\bk=["']([^"']+)["']/g)) add(m[1]);
  for (const m of src.matchAll(/usePageMeta\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/g)) {
    add(m[1]);
    add(m[2]);
  }
}
// enum → key maps live as plain literals in keys.ts
const keysTs = fs.readFileSync(path.join(SRC, "i18n/keys.ts"), "utf8");
for (const m of keysTs.matchAll(/["']([a-z]+\.[a-zA-Z0-9.]+)["']/g)) add(m[1]);

const enUi = JSON.parse(fs.readFileSync(EN_UI, "utf8"));
const enSr = JSON.parse(fs.readFileSync(EN_SR, "utf8"));
const uiKeys = new Set(Object.keys(enUi));
const srKeys = new Set(Object.keys(enSr));

const missing = [...used].filter((k) => !uiKeys.has(k) && !srKeys.has(k));
const unused = [...uiKeys].filter((k) => !used.has(k));

console.log(`keys used in source: ${used.size}`);
console.log(`keys in en.json (ui): ${uiKeys.size}, (sample-report): ${srKeys.size}`);
if (missing.length) {
  console.log(`\nMISSING from en.json (${missing.length}):`);
  missing.forEach((k) => console.log(`  - ${k}`));
} else {
  console.log("\nAll used keys exist in en.json ✓");
}
if (unused.length) {
  console.log(`\nUnused ui keys (check if intended) (${unused.length}):`);
  unused.forEach((k) => console.log(`  - ${k}`));
}
process.exit(missing.length ? 1 : 0);
