#!/usr/bin/env node
/** Summarize a Lighthouse report JSON: scores, metrics, LCP element + phases, key failing audits. */
const fs = require("fs");
const file = process.argv[2];
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const a = report.audits;
const cats = report.categories;
console.log("===== SCORES =====");
for (const c of Object.keys(cats)) console.log(`${cats[c].title}: ${Math.round((cats[c].score ?? 0) * 100)}`);
const row = (k) => `${k}: ${(a[k]?.numericValue / 1000).toFixed(2)}s (${a[k]?.displayValue ?? ""})`;
console.log("\n===== METRICS =====");
for (const k of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "speed-index", "interactive"]) row(k) && console.log(row(k));
console.log(`CLS: ${a["cumulative-layout-shift"]?.displayValue}`);

console.log("\n===== LCP ELEMENT =====");
const lcpEl = a["largest-contentful-paint-element"];
const node = lcpEl?.details?.items?.[0]?.items?.[0]?.node;
if (node) {
  console.log("Selector:", node.selector);
  console.log("Snippet:", node.snippet);
  console.log(node.explanation || "");
}
const phases = a["largest-contentful-paint-breakdown"]?.details?.items?.[0];
if (phases) {
  for (const [k, v] of Object.entries(phases)) {
    if (typeof v === "number") console.log(`  phase ${k}: ${Math.round(v)}ms`);
  }
}
const discovery = a["lcp-lazy-loaded"]?.displayValue ? `lazy-loaded: ${a["lcp-lazy-loaded"].displayValue}` : "";
if (discovery) console.log(discovery);

console.log("\n===== NON-COMPOSITED ANIMATIONS =====");
const nca = a["non-composited-animations"]?.details?.items || [];
for (const it of nca) {
  console.log(it?.subItems?.items?.map(s => `${s.reason} — ${s.node?.snippet || s.node?.selector}`).join("\n") || JSON.stringify(it).slice(0, 300));
}

console.log("\n===== CONTRAST FAILURES =====");
(a["color-contrast"]?.details?.items || []).forEach(i => console.log(i.node?.selector, "→", i.node?.snippet?.slice(0, 120)));

console.log("\n===== KEY AUDITS =====");
for (const k of ["unused-javascript", "legacy-javascript", "render-blocking-resources", "modern-image-formats", "uses-responsive-images", "total-byte-weight", "dom-size", "long-tasks"]) {
  const aud = a[k];
  if (aud) console.log(`${k}: score=${aud.score} ${aud.displayValue ?? ""}`);
}
