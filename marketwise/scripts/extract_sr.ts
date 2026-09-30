/**
 * Build-time helper: extracts every translatable string from the fictional
 * sample report into src/i18n/sample-report/en.json — the source file the
 * translation agents work from, and the parity reference for validation.
 *
 * Run: bun scripts/extract_sr.ts
 */
import { writeFileSync } from "node:fs";
import { SAMPLE_REPORT } from "../src/lib/sample-report";
import { sampleReportStrings } from "../src/i18n/sample-report/walk";

const strings = sampleReportStrings(SAMPLE_REPORT);
const keys = Object.keys(strings).sort();
writeFileSync(
  "/home/z/my-project/src/i18n/sample-report/en.json",
  JSON.stringify(
    Object.fromEntries(keys.map((k) => [k, strings[k]]),
  ),
  null,
  2,
) + "\n");

console.log(`sample-report/en.json written: ${keys.length} translatable strings`);
