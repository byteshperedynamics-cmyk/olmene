/**
 * Sample-report i18n plumbing.
 *
 * The fictional Fernway Journals report (src/lib/sample-report.ts) is the
 * single source of truth for STRUCTURE and NUMBERS. Every human-readable
 * string in it is extracted (at build time) into a flat dictionary whose
 * keys are the object paths — "sr.market.trends.2.implication" — and each
 * language ships its own flat JSON of the same shape. At runtime,
 * hydrateReport() walks the skeleton and overlays translated strings,
 * falling back to English for any missing key (a bad translation can never
 * break the page).
 *
 * Fields that are NOT translatable (URLs, source ids, enum chips, model
 * names) are skipped by key/value rules shared by extractor and hydrator,
 * so the two sides can never disagree.
 */

import type { ReportData } from "@/lib/report-types";
import { LANG_MAP, type LangCode } from "@/i18n/languages";
import type { Dict } from "@/i18n/provider";

/** Object keys whose values are data, not prose (enum chips are mapped to
 *  dictionary keys at render time instead — see src/i18n/keys.ts). */
const SKIP_KEYS = new Set([
  "url",
  "siteUrl",
  "sourceIds",
  "id",
  "modelsUsed",
  "language", // display language is derived from the active locale instead
  "status",
  "severity",
  "effort",
  "impact",
  "threat",
  "confidence",
  "schemaVersion",
  "fitScore",
  "priority",
  "generatedAt", // ISO timestamp
]);

/** Exact paths that stay in Latin script regardless of language:
 *  brand names (the fictional product + real competitors). */
const SKIP_PATHS = new Set(["product.name"]);

function isTranslatable(path: string, key: string, value: string): boolean {
  if (SKIP_KEYS.has(key)) return false;
  if (SKIP_PATHS.has(path)) return false;
  // competitors.<n>.name — real-world brand names stay as-is
  if (/^competitors\.\d+\.name$/.test(path)) return false;
  if (/^https?:\/\//i.test(value)) return false; // URLs stay as-is
  return value.trim().length > 0;
}

/** Prefix applied to every sample-report dictionary key. */
export const SR_PREFIX = "sr.";

type Visitor = (path: string, value: string) => void;

/** Depth-first walk over the report data; calls visit() for every string
 *  field that should be translated. Deterministic order = object order. */
export function walkReport(node: unknown, path: string, visit: Visitor, parentKey = ""): void {
  if (typeof node === "string") {
    if (isTranslatable(path, parentKey, node)) visit(path, node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkReport(item, `${path}.${i}`, visit, parentKey));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkReport(v, path ? `${path}.${k}` : k, visit, k);
    }
  }
}

/** Flat dictionary of every translatable string in the sample report. */
export function sampleReportStrings(report: ReportData): Dict {
  const out: Dict = {};
  walkReport(report, "", (path, value) => {
    out[SR_PREFIX + path] = value;
  });
  return out;
}

/** Deep-clone the report, overlaying translated strings from `dict`.
 *  Missing keys gracefully fall back to the English skeleton. */
export function hydrateReport(report: ReportData, dict: Dict | null, lang: LangCode): ReportData {
  if (!dict && lang === "en") return report;
  const clone = JSON.parse(JSON.stringify(report)) as ReportData;
  walkReport(clone, "", (path, _value) => {
    const hit = dict?.[SR_PREFIX + path];
    if (typeof hit === "string" && hit.trim().length > 0) {
      // write back through the path
      setPath(clone, path, hit);
    }
  });
  // The report's own "language" meta reflects how it is being displayed.
  if (lang !== "en") {
    clone.meta.language = LANG_MAP[lang]?.english ?? clone.meta.language;
  }
  return clone;
}

function setPath(root: unknown, path: string, value: string): void {
  const parts = path.split(".");
  let node: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node == null) return;
    node = (node as Record<string, unknown>)[parts[i]];
  }
  if (node == null) return;
  (node as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

// Lazy loaders — one chunk per language, fetched only on /sample-report.
export const SR_LOADERS: Partial<Record<LangCode, () => Promise<{ default: Dict }>>> = {
  zh: () => import("./zh.json"),
  hi: () => import("./hi.json"),
  es: () => import("./es.json"),
  fr: () => import("./fr.json"),
  ar: () => import("./ar.json"),
  bn: () => import("./bn.json"),
  pt: () => import("./pt.json"),
  ru: () => import("./ru.json"),
  ur: () => import("./ur.json"),
  id: () => import("./id.json"),
  de: () => import("./de.json"),
  ja: () => import("./ja.json"),
  tr: () => import("./tr.json"),
  el: () => import("./el.json"),
};
