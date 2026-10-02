// Regression tests for the free-audit signals, built from real-site failures
// found in the 2026-10-02 accuracy evaluation. Run (Deno):
//   deno test --allow-read --allow-write --allow-net supabase/functions/free-audit/index.test.ts
// index.ts calls Deno.serve() at import time, so the test loads a copy with the
// server stubbed out and the internals exposed.
import { assert, assertEquals } from "jsr:@std/assert@1";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const patched = src.replace("Deno.serve(", "const __noServe = (") +
  "\nexport { computeSeoSignals, buildFindings, findTrustSignals, CTA_PATTERN };\n";
const tmp = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tmp, patched);
const mod = await import(`file://${tmp}`);
const extras = { robotsTxtOk: true, sitemapXmlOk: true, sitemapUrl: null, faviconIcoOk: false };
const page = (body: string, head = "") =>
  `<html lang="en"><head><title>Acme analytics for teams</title>${head}</head><body>${body}</body></html>`;
const signals = (body: string, head = "") => mod.computeSeoSignals(page(body, head), "https://acme.test/", extras);

Deno.test("CTA: word-bounded — 'poetry', 'Telemetry', 'unsubscribe' are not calls to action", () => {
  const s = signals(`<a href="/p">poetry</a><a href="/t">Telemetry</a><a href="/u">unsubscribe</a>`);
  assertEquals(s.ctaButtons, []);
});

Deno.test("CTA: a lead-capture form counts whatever its label ('Scan my site')", () => {
  const s = signals(`<form><input type="text" name="url"><button type="submit">Scan my site</button></form>`);
  assertEquals(s.ctaButtons, ["Scan my site"]);
});

Deno.test("CTA: site search forms are not CTAs; icon-only submit is labelled", () => {
  assertEquals(signals(`<form role="search"><input type="search"><button>Go</button></form>`).ctaButtons, []);
  assertEquals(signals(`<form><input type="email"><button>→</button></form>`).ctaButtons, ["Signup form"]);
});

Deno.test("CTA: common phrasings and other languages", () => {
  for (const t of ["Get Notion free", "Request a demo", "S’abonner", "Jetzt kostenlos testen", "Empieza gratis", "Start fixing"]) {
    assert(mod.CTA_PATTERN.test(t), t);
  }
});

Deno.test("CTA label keeps spaces between nested elements", () => {
  const s = signals(`<a href="/s"><span>Sign Up</span><small>Create a free account</small></a>`);
  assertEquals(s.ctaButtons, ["Sign Up Create a free account"]);
});

Deno.test("Alt text: alt=\"\" is decorative (valid); only a missing attribute counts; pixels ignored", () => {
  const s = signals(`<img src=a alt=""><img src=b alt="Chart"><img src=c><img src=t width="1" height="1">`);
  assertEquals([s.imagesTotal, s.imagesWithoutAlt], [3, 1]);
});

Deno.test("Trust: substrings and verbs don't count ('generated', 'preview', 'you review')", () => {
  assertEquals(mod.findTrustSignals("our reports are generated daily. preview the dashboard. you review and merge."), []);
});

Deno.test("Trust: negated sentences don't count", () => {
  assertEquals(mod.findTrustSignals("there are no visible testimonials, logos, or case studies yet."), []);
});

Deno.test("Trust: real-world phrasings count", () => {
  const found = mod.findTrustSignals(
    "trusted by 14 million entrepreneurs. 20,000 companies on vercel. wall of love. rated 4.8 out of 5 on g2. free returns.",
  );
  for (const k of ["trusted by", "customer count", "customer stories", "star rating", "review sites", "easy returns"]) {
    assert(found.includes(k), `${k} in ${found}`);
  }
});

Deno.test("Trust: quote blocks and logo walls are structural proof", () => {
  const logos = Array.from({ length: 5 }, (_, i) => `<img src=${i} alt="Customer ${i} logo">`).join("");
  const s = signals(`<blockquote>Great</blockquote><blockquote>Love it</blockquote>${logos}`);
  assert(s.trustSignals.includes("customer quotes") && s.trustSignals.includes("customer logos"), String(s.trustSignals));
});

Deno.test("Trust: social proof far down the page is still read (was cut at 12k chars)", () => {
  const filler = "<p>" + "lorem ipsum dolor sit amet ".repeat(800) + "</p>";
  assert(signals(`${filler}<h2>What our customers say</h2>`).trustSignals.includes("customer stories"));
});

Deno.test("Favicon: /favicon.ico counts without a <link>", () => {
  const s = mod.computeSeoSignals(page("<p>x</p>"), "https://acme.test/", { ...extras, faviconIcoOk: true });
  assert(s.favicon);
});
