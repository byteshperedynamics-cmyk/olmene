#!/usr/bin/env node
/**
 * i18n dictionary validator.
 *
 * Usage:
 *   node scripts/i18n_validate.js            # validate every language
 *   node scripts/i18n_validate.js el de      # validate specific languages
 *
 * Checks per language (UI dict + sample-report dict vs the English source):
 *   1. valid JSON, values are non-empty strings
 *   2. key set identical to English (no missing, no extra)
 *   3. {placeholder} sets identical per key
 *   4. [[...]] and {{...}} marker counts identical per key
 *   5. plural keys (containing "|") keep exactly the same pipe count
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = "/home/z/my-project/src/i18n";
const UI = path.join(ROOT, "dictionaries");
const SR = path.join(ROOT, "sample-report");
const LANGS = [
  "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur", "id", "de", "ja", "tr", "el",
];

const args = process.argv.slice(2);
const targets = args.length ? args : LANGS;

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const placeholders = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(",");
const markerCount = (s, re) => (s.match(re) || []).length;

function validateDict(name, enPath, langPath) {
  const errors = [];
  let en, lang;
  try {
    lang = readJson(langPath);
  } catch (e) {
    return { name, errors: [`cannot parse ${langPath}: ${e.message}`] };
  }
  en = readJson(enPath);

  const enKeys = Object.keys(en);
  const langKeys = new Set(Object.keys(lang));

  const missing = enKeys.filter((k) => !langKeys.has(k));
  if (missing.length) errors.push(`${missing.length} MISSING keys: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}`);

  const extra = [...langKeys].filter((k) => !(k in en));
  if (extra.length) errors.push(`${extra.length} EXTRA keys: ${extra.slice(0, 8).join(", ")}${extra.length > 8 ? " …" : ""}`);

  let empty = 0, ph = 0, mk = 0, pipe = 0;
  for (const k of enKeys) {
    if (!(k in lang)) continue;
    const v = lang[k];
    if (typeof v !== "string" || v.trim() === "") { empty++; continue; }
    if (placeholders(en[k]) !== placeholders(v)) {
      ph++;
      if (ph <= 5) errors.push(`placeholder mismatch @ ${k}: en={${placeholders(en[k])}} vs lang={${placeholders(v)}}`);
    }
    const emEn = markerCount(en[k], /\[\[[^\]]*\]\]/g), emL = markerCount(v, /\[\[[^\]]*\]\]/g);
    const stEn = markerCount(en[k], /\{\{[^}]*\}\}/g), stL = markerCount(v, /\{\{[^}]*\}\}/g);
    if (emEn !== emL || stEn !== stL) {
      mk++;
      if (mk <= 5) errors.push(`marker mismatch @ ${k}: en [[${emEn}]]/{{${stEn}}} vs lang [[${emL}]]/{{${stL}}}`);
    }
    const pEn = markerCount(en[k], /\|/g), pL = markerCount(v, /\|/g);
    if (pEn !== pL) {
      pipe++;
      if (pipe <= 5) errors.push(`plural "|" mismatch @ ${k}: en has ${pEn}, lang has ${pL}`);
    }
  }
  if (empty) errors.push(`${empty} empty/non-string values`);
  return { name, errors, keys: enKeys.length };
}

let failed = 0;
for (const lang of targets) {
  if (lang === "en") continue;
  const ui = validateDict(`${lang}/dictionaries`, path.join(UI, "en.json"), path.join(UI, `${lang}.json`));
  const sr = validateDict(`${lang}/sample-report`, path.join(SR, "en.json"), path.join(SR, `${lang}.json`));
  for (const r of [ui, sr]) {
    if (r.errors.length) {
      failed++;
      console.log(`FAIL ${r.name} (${r.keys} keys):`);
      r.errors.forEach((e) => console.log(`   - ${e}`));
    } else {
      console.log(`PASS ${r.name} (${r.keys} keys)`);
    }
  }
}
process.exit(failed ? 1 : 0);
