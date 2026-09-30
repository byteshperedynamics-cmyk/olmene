/**
 * unit_tests.ts — pipeline unit benchmark (baseline vs enhanced).
 *
 * Usage:
 *   deno run --allow-all unit_tests.ts <bundlePath> <variant> <outJsonPath>
 *
 * Measures, per variant:
 *   T1  JSON repair success rate on a 20-sample malformed-LLM-output corpus
 *   T2  boilerplate share of extracted page text (nav/footer/cookie noise)
 *   T3  SEO checklist depth (number of deterministic checks) + new detections
 *   T4  SEO score variance under jittered LLM scores (blending effect)
 *   T5  competitor top-up (min competitors when picks are thin)
 *   T6  prompt size budgets (regression guard, chars)
 */
import { loadBundle, pct, stddev } from "./harness.ts";

const [bundlePath, variant, outJsonPath] = Deno.args;
if (!bundlePath || !variant || !outJsonPath) {
  console.error("usage: unit_tests.ts <bundlePath> <variant> <outJsonPath>");
  Deno.exit(2);
}
const P = await loadBundle(bundlePath, variant);
const R: Record<string, unknown> = { variant };

// ───────────────────────── T1: JSON repair corpus ─────────────────────────
const validTarget = { name: "Acme", pricing: "€19/mo", notes: "line1\nline2", tags: ["a", "b"], score: 8 };
const CORPUS: Array<{ id: string; label: string; raw: string; expectEqual?: boolean; expectParse?: boolean }> = [
  { id: "01", label: "clean JSON", raw: JSON.stringify(validTarget), expectParse: true, expectEqual: true },
  { id: "02", label: "```json fenced", raw: "```json\n" + JSON.stringify(validTarget) + "\n```", expectParse: true },
  { id: "03", label: "``` fenced no lang", raw: "```\n" + JSON.stringify(validTarget) + "\n```", expectParse: true },
  { id: "04", label: "prose before object", raw: "Sure! Here is the analysis:\n" + JSON.stringify(validTarget), expectParse: true },
  { id: "05", label: "prose after object", raw: JSON.stringify(validTarget) + "\nLet me know if you want more detail.", expectParse: true },
  { id: "06", label: "trailing comma in object", raw: '{"name":"Acme","pricing":"€19/mo","tags":["a","b"],}', expectParse: true },
  { id: "07", label: "trailing comma in array", raw: '{"name":"Acme","tags":["a","b",],"score":8}', expectParse: true },
  { id: "08", label: "unescaped newline in string", raw: '{"name":"Acme","notes":"line1\nline2"}', expectParse: true },
  { id: "09", label: "unescaped tab in string", raw: '{"name":"Acme","notes":"col1\tcol2"}', expectParse: true },
  { id: "10", label: "smart quotes around values", raw: '{"name":\u201CAcme\u201D,"pricing":\u201C€19/mo\u201D}', expectParse: true },
  { id: "11", label: "single-quoted keys and values", raw: "{'name':'Acme','pricing':'€19/mo'}", expectParse: true },
  { id: "12", label: "Python literals True/None", raw: '{"name":"Acme","active":True,"parent":None}', expectParse: true },
  { id: "13", label: "BOM prefix", raw: "\uFEFF" + JSON.stringify(validTarget), expectParse: true },
  { id: "14", label: "NaN value", raw: '{"name":"Acme","ratio":NaN}', expectParse: true },
  { id: "15", label: "ellipsis placeholder (unrecoverable)", raw: '{"name":"Acme","findings":[...]}', expectParse: false },
  { id: "16", label: "truncated JSON (unrecoverable)", raw: '{"name":"Acme","pricing":"€19/mo","notes":"was cut mid-sent', expectParse: false },
  { id: "17", label: "fenced with prose around", raw: "Certainly!\n```json\n" + JSON.stringify(validTarget) + "\n```\nHope this helps.", expectParse: true },
  { id: "18", label: "unquoted keys", raw: '{name:"Acme",pricing:"€19/mo"}', expectParse: true },
  { id: "19", label: "two JSON objects (take first)", raw: JSON.stringify(validTarget) + "\n\n" + JSON.stringify({ other: true }), expectParse: true },
  { id: "20", label: "trailing semicolon", raw: JSON.stringify(validTarget) + ";", expectParse: true },
];

const parseLlmJson = P.parseLlmJson as (raw: string) => unknown;
const recovered: string[] = [];
const failed: string[] = [];
let falsePositives = 0;
for (const c of CORPUS) {
  let ok = false;
  try {
    const v = parseLlmJson(c.raw);
    ok = typeof v === "object" && v !== null;
    if (ok && c.id === "01" && JSON.stringify(v) !== JSON.stringify(validTarget)) falsePositives++;
    if (ok && c.id === "19" && (v as Record<string, unknown>).other === true) falsePositives++; // took second object
  } catch { /* not recovered */ }
  if (ok === !!c.expectParse) recovered.push(`${c.id}:${ok ? "pass" : "correctly-rejected"}`);
  else failed.push(`${c.id}:${c.label}`);
}
const recoverable = CORPUS.filter((c) => c.expectParse).length;
const recoveredCount = recovered.filter((r) => r.endsWith("pass")).length;
R.t1_json_repair = {
  recoverable_samples: recoverable,
  recovered: recoveredCount,
  repair_success_pct: pct(recoveredCount, recoverable),
  unexpected: failed,
  false_positives: falsePositives,
};

// ─────────────────────── T2: boilerplate share ────────────────────────────
const BOILERPLATE_HTML = `<!doctype html><html lang="en"><head><title>Acme — Marketing automation for small teams</title>
<meta name="description" content="Acme automates your marketing emails, ads and reports in one place."></head>
<body>
<nav class="topnav"><a href="/">Home</a><a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a><a href="/login">Log in</a></nav>
<div id="cookie-banner" class="cookie-consent">We use cookies to improve your experience. <button>Accept all</button><button>Cookie settings</button> Read our privacy policy.</div>
<main>
<h1>Marketing automation that feels like a teammate</h1>
<p>Acme brings your email campaigns, ad audiences and weekly growth reports into one calm dashboard. Teams of 2-10 replace five scattered tools with Acme and save six hours every week on marketing busywork.</p>
<h2>Why teams pick Acme</h2>
<p>Unlike enterprise suites priced for departments, Acme is built for small product teams. Every feature works on day one without a consultant, and our templates come from real campaigns run by companies like yours.</p>
<h2>Pricing that scales with you</h2>
<p>Start free with 500 contacts. Grow to 5,000 contacts for 29 per month. Every plan includes unlimited sends, A/B testing and the weekly growth report.</p>
<blockquote>“We cancelled three tools the week we moved to Acme.” — Dana, founder of a 4-person studio</blockquote>
</main>
<footer><nav><a href="/about">About</a><a href="/careers">Careers</a><a href="/legal">Legal</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/sitemap.xml">Sitemap</a></nav>
<p>© 2026 Acme Inc. All rights reserved. Made in Berlin.</p></footer>
<aside class="newsletter">Subscribe to our newsletter for weekly tips.</aside>
</body></html>`;

const extractPageSummary = P.extractPageSummary as (html: string, url: string, maxText?: number) => { text: string; title: string; links: unknown[] };
const sum = extractPageSummary(BOILERPLATE_HTML, "https://acme.example/", 12000);
const boilerMarkers = ["cookie settings", "all rights reserved", "accept all", "careers", "sitemap", "subscribe to our newsletter", "log in"];
const hits = boilerMarkers.filter((m) => sum.text.toLowerCase().includes(m));
const contentMarkers = ["feels like a teammate", "500 contacts", "six hours", "dana"];
const contentKept = contentMarkers.filter((m) => sum.text.toLowerCase().includes(m));
R.t2_boilerplate = {
  boilerplate_marker_hits: hits.length,
  boilerplate_markers: hits,
  content_coverage_pct: pct(contentKept.length, contentMarkers.length),
  extracted_chars: sum.text.length,
};

// ─────────────────────── T3: SEO checklist depth ──────────────────────────
const SEO_GOOD = `<!doctype html><html lang="en"><head>
<title>Acme — Marketing automation for small teams</title>
<meta name="description" content="Acme automates email campaigns, ad audiences and weekly growth reports for small product teams. Free up six hours a week.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Acme — Marketing automation">
<meta property="og:description" content="Automation for small teams.">
<meta property="og:image" content="https://acme.example/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://acme.example/">
<link rel="icon" href="/favicon.ico">
<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
</head><body>
<h1>Marketing automation</h1><h2>Why Acme</h2><h2>Pricing</h2><h3>FAQ</h3>
<a href="/pricing" class="btn">Start free trial</a>
<img src="/a.png" alt="Dashboard"><img src="/b.png" alt="Reports">
<p>${"Acme saves teams six hours per week on marketing busywork. ".repeat(12)}</p>
<a href="https://status.acme.example">Status</a>
</body></html>`;
const computeSeoSignals = P.computeSeoSignals as (html: string, url: string, extras?: Record<string, unknown>) => { checklist: Array<{ check: string; status: string }>; [k: string]: unknown };
const signals = computeSeoSignals(SEO_GOOD, "https://acme.example/", { robotsTxtOk: true, sitemapXmlOk: true });
const checkNames = signals.checklist.map((c) => c.check);
R.t3_seo_checklist = {
  checks: signals.checklist.length,
  has_https_check: checkNames.some((n) => /https/i.test(n)),
  has_favicon_check: checkNames.some((n) => /favicon/i.test(n)),
  has_ogimage_check: checkNames.some((n) => /og:image|social preview image/i.test(n)),
  pass_count: signals.checklist.filter((c) => c.status === "pass").length,
};

// ─────────────────────── T4: score variance under LLM jitter ──────────────
// Simulate: same deterministic checklist, LLM returns seo scores jittered
// around 62 with std ~9. Pure-LLM scoring inherits the full jitter; a blend
// with the deterministic checklist score halves it.
const checklist = signals.checklist.map((c) => ({ status: c.status }));
let deterministic: number | null = null;
const blend = P.blendSeoScore as ((checklist: Array<{ status: string }>, llmScore: number) => number) | undefined;
if (P.checklistScore) deterministic = (P.checklistScore as (c: Array<{ status: string }>) => number)(checklist);
const llmDraws: number[] = [];
const finalScores: number[] = [];
let seed = 42;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 30; i++) {
  const llm = Math.max(0, Math.min(100, Math.round(62 + (rand() + rand() + rand() - 1.5) * 12)));
  llmDraws.push(llm);
  finalScores.push(blend ? blend(checklist, llm) : llm);
}
R.t4_score_variance = {
  llm_score_stddev: Math.round(stddev(llmDraws) * 10) / 10,
  final_score_stddev: Math.round(stddev(finalScores) * 10) / 10,
  deterministic_checklist_score: deterministic,
  blending: typeof blend === "function",
};

// ─────────────────────── T5: competitor top-up ────────────────────────────
const SOURCES = [
  { id: "S1", url: "https://competitorone.com/", title: "Competitor One — automation", snippet: "", publishedDate: undefined },
  { id: "S2", url: "https://competitorone.com/pricing", title: "Competitor One pricing", snippet: "", publishedDate: undefined },
  { id: "S3", url: "https://competitortwo.io/", title: "Competitor Two — emails", snippet: "", publishedDate: undefined },
  { id: "S4", url: "https://competitortwo.io/reviews", title: "Competitor Two reviews", snippet: "", publishedDate: undefined },
  { id: "S5", url: "https://competitorthree.com/", title: "Competitor Three — reports", snippet: "", publishedDate: undefined },
  { id: "S6", url: "https://news.example.com/best-tools-2026", title: "Best tools 2026 (listicle)", snippet: "", publishedDate: undefined },
];
const topUp = P.topUpCompetitorPicks as ((sources: typeof SOURCES, existing: Array<{ name: string; url: string }>, want: number) => Array<{ name: string; url: string }>) | undefined;
let minCompetitors: number | null = null;
let topUpValid = false;
if (topUp) {
  const existing = [{ name: "Competitor One", url: "https://competitorone.com/" }];
  const added = topUp(SOURCES, existing, 3);
  const addedSet = new Set(added.map((a) => a.url));
  topUpValid = added.length >= 2 &&
    added.every((a) => SOURCES.some((s) => new URL(s.url).host === new URL(a.url).host)) &&
    ![...addedSet].some((u) => existing.some((e) => new URL(e.url).host === new URL(u).host));
  minCompetitors = existing.length + added.length;
} else {
  minCompetitors = 1; // baseline behaviour: no top-up, thin picks stay thin
}
R.t5_competitor_topup = { min_competitors: minCompetitors, topup_logic_valid: topUpValid };

// ─────────────────────── T6: prompt budgets ───────────────────────────────
const bigInput = {
  siteUrl: "https://acme.example/very/long/path?ignored=true",
  productName: "Acme Marketing Automation Suite".repeat(3),
  targetMarket: "Germany, Austria, Switzerland, small product teams in B2B SaaS".repeat(2),
  knownCompetitors: ["https://competitorone.com/", "https://competitortwo.io/", "https://competitorthree.com/"],
  goal: "grow_revenue",
  language: "English",
};
const bigPages = Array.from({ length: 5 }, (_, i) => ({
  url: `https://acme.example/page-${i}`,
  title: "Acme page with a fairly long title that goes on and on",
  text: "Acme automates marketing for small teams. ".repeat(120),
}));
const bigSources = Array.from({ length: 30 }, (_, i) => ({
  id: `S${i + 1}`, url: `https://src.example.com/${i}`, title: "Source title that is reasonably long for a search result snippet",
  snippet: "This snippet describes the source in detail. ".repeat(12), publishedDate: "2026-01-01",
}));
const bigProfile = {
  name: "Acme", category: "Marketing automation software", oneLiner: "x".repeat(600),
  offerings: ["o1", "o2", "o3", "o4"], pricingModel: "y".repeat(400),
  targetCustomers: ["small teams", "studios", "founders"],
  valueProps: ["v".repeat(300), "v".repeat(300)], tone: "warm", detectedChannels: [], siteLanguage: "English",
};
const prompts = {
  profile: (P.profilePrompt as (i: unknown, p: unknown) => string)(bigInput, bigPages),
  audit: (P.auditPrompt as (i: unknown, p: unknown, pg: unknown, s: unknown, src: unknown) => string)(bigInput, bigProfile, bigPages, { pageUrl: "https://acme.example/", titleText: "Acme — Marketing automation", titleLength: 40, metaDescription: "d", metaDescriptionLength: 40, h1Count: 1, h1Texts: ["Marketing automation"], headingOutline: ["h2: Why", "h2: Pricing"], canonical: null, lang: "en", viewport: true, openGraph: true, twitterCard: true, jsonLdTypes: [], imagesWithoutAlt: 1, imagesTotal: 4, internalLinks: 10, externalLinks: 3, wordCount: 800, hasPricingPage: true, ctaButtons: ["Start free"], trustSignals: ["reviews"], robotsMeta: null, robotsTxtOk: true, sitemapXmlOk: true }, bigSources),
  market: (P.marketPrompt as (i: unknown, p: unknown, s: unknown) => string)(bigInput, bigProfile, bigSources),
  strategy: (P.strategyPrompt as (i: unknown, p: unknown, m: unknown, c: unknown, a: unknown, s: unknown) => string)(bigInput, bigProfile,
    { definition: "d".repeat(600), size: { value: "$1B", basis: "b".repeat(500), confidence: "medium", sourceIds: ["S1"] }, trends: [], segments: [], potentialAssessment: "p".repeat(1200) },
    [{ name: "C1", url: "https://c1.example/", positioning: "x".repeat(400), pricing: "$10", strengths: [], weaknesses: [], gapToExploit: "g".repeat(300), threat: "medium", sourceIds: ["S1"] }],
    { messaging: [], conversion: [], seo: [], trust: [], pricingPresentation: [] }, bigSources),
};
R.t6_prompt_budgets = Object.fromEntries(
  Object.entries(prompts).map(([k, v]) => [k, { chars: v.length, under_120k: v.length < 120_000 }]),
);

await Deno.writeTextFile(outJsonPath, JSON.stringify(R, null, 2));
console.log(`\n=== ${variant} unit metrics ===`);
console.log(`T1  JSON repair:        ${recoveredCount}/${recoverable} = ${(R.t1_json_repair as { repair_success_pct: number }).repair_success_pct}%  (unexpected: ${failed.join(", ") || "none"})`);
const t2 = R.t2_boilerplate as { boilerplate_marker_hits: number; content_coverage_pct: number };
console.log(`T2  boilerplate:        ${t2.boilerplate_marker_hits}/7 markers leak into LLM text, content coverage ${t2.content_coverage_pct}%`);
const t3 = R.t3_seo_checklist as { checks: number; has_https_check: boolean; has_favicon_check: boolean; has_ogimage_check: boolean };
console.log(`T3  SEO checklist:      ${t3.checks} checks (https:${t3.has_https_check} favicon:${t3.has_favicon_check} og:image:${t3.has_ogimage_check})`);
const t4 = R.t4_score_variance as { llm_score_stddev: number; final_score_stddev: number; deterministic_checklist_score: number | null };
console.log(`T4  score variance:     LLM σ=${t4.llm_score_stddev} → final σ=${t4.final_score_stddev} (checklist=${t4.deterministic_checklist_score})`);
const t5 = R.t5_competitor_topup as { min_competitors: number };
console.log(`T5  min competitors:    ${t5.min_competitors}`);
console.log(`T6  prompt budgets:     ${Object.entries(prompts).map(([k, v]) => `${k}=${(v.length / 1000).toFixed(1)}k`).join(" ")}`);
console.log(`\nwritten: ${outJsonPath}`);
