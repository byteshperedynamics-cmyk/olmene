// Regression tests for the free-audit signals, built from real-site failures
// found in the 2026-10-02 accuracy evaluation. Run (Deno):
//   deno test --allow-read --allow-write --allow-net supabase/functions/free-audit/index.test.ts
// index.ts calls Deno.serve() at import time, so the test loads a copy with the
// server stubbed out and the internals exposed.
import { assert, assertEquals } from "jsr:@std/assert@1";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const patched = src.replace("Deno.serve(", "const __noServe = (") +
  "\nexport { computeSeoSignals, buildFindings, findTrustSignals, CTA_PATTERN, assertSafeTarget, TargetRejected, ScanError, scanFailure };\n";
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

// ── 2026-10-04 readiness fixes: pricing/trust/CTA false negatives, SSRF ────

Deno.test("pricing: non-English pricing links count (Holded 'Precios', sevdesk '/preise/')", () => {
  assert(signals(`<nav><a href="/es/precios">Precios</a></nav>`).hasPricingPage);
  assert(signals(`<nav><a href="/preise/">Preise</a></nav>`).hasPricingPage);
  assert(signals(`<nav><a href="/tarifs">Tarifs</a></nav>`).hasPricingPage);
});

Deno.test("pricing: prices on the homepage count ('$2.99/month' — Bear)", () => {
  const s = signals(`<p>A 7 day free trial, then $2.99/month or $29.99/year.</p>`);
  assertEquals(s.pricingEvidence, "homepage");
  assertEquals(s.checklist.find((c: { check: string }) => c.check === "Pricing page").status, "pass");
});

Deno.test("store: product prices satisfy 'pricing'; product tiles are the CTA (demo.vercel.store)", () => {
  const tiles = ["Shirt $20.00USD", "Bag $12.00USD", "Cup $15.00USD", "Mug $15.00USD", "Hoodie $50.00USD"]
    .map((t, i) => `<a href="/product/item-${i}">${t}</a>`).join("");
  const s = signals(tiles + `<a href="/cart">Cart</a>`);
  assert(s.isStore);
  assertEquals(s.pricingEvidence, "store");
  assertEquals(s.ctaButtons, ["Product links"]);
  const titles = mod.buildFindings(s).map((f: { title: string }) => f.title);
  assert(!titles.includes("Pricing is hidden from the homepage"));
  assert(!titles.includes("No clear call-to-action on the homepage"));
});

Deno.test("trust: quoted, attributed testimonials count (Buttondown)", () => {
  const q = (t: string, who: string) => `<figure><blockquote>“${t}”</blockquote><figcaption>${who}</figcaption></figure>`;
  const s = signals(q("Three years later, I'm still happy with the choice to shift to this platform.", "Jeremy Singer-Vine") +
    q("I didn't want to sign on with a place that was going to pursue that metastatic overgrowth.", "Clive Thompson"));
  assert(s.trustSignals.includes("customer quotes"), JSON.stringify(s.trustSignals));
});

Deno.test("trust: German and Spanish proof words and comma-decimal ratings count", () => {
  const de = signals(`<p>Testsieger 2026 mit Note 1,2</p><p>Über 1.200 Bewertungen</p>`);
  assert(de.trustSignals.includes("test winner") && de.trustSignals.includes("reviews"), JSON.stringify(de.trustSignals));
  const es = signals(`<p>4,6/5 en Capterra</p><p>Más de 100.000 empresas confían en nosotros</p>`);
  assert(es.trustSignals.includes("star rating"), JSON.stringify(es.trustSignals));
});

Deno.test("SSRF: IP literals in any encoding, private ranges, odd ports and IPv6 are rejected", async () => {
  for (const u of [
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://127.1/", "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/", "http://192.168.1.1/", "http://[::1]/", "http://[fd00::1]/",
    "http://example.com:6379/", "https://example.com:8443/",
  ]) {
    let rejected = false;
    try {
      await mod.assertSafeTarget(new URL(u));
    } catch (e) {
      rejected = e instanceof mod.TargetRejected;
    }
    assert(rejected, `${u} must be rejected`);
  }
});

Deno.test("errors: bot-blocked sites get an honest message, never internal details", () => {
  const blocked = mod.scanFailure(new mod.ScanError("blocked", "HTTP 429", 429));
  assertEquals(blocked.code, "site_blocked");
  assert(/blocks automated visitors/.test(blocked.message) && !/check the url/i.test(blocked.message));
  const generic = mod.scanFailure(new Error("error sending request from 10.33.3.10:44080"));
  assert(!/10\.33/.test(generic.message));
});

Deno.test("errors: a domain that does not exist reads as a typo, not as a forbidden target", async () => {
  // Stub DNS (NXDOMAIN) so the test is fast and offline.
  const original = Deno.resolveDns;
  Object.defineProperty(Deno, "resolveDns", { value: () => Promise.reject(new Error("no record")), configurable: true, writable: true });
  let err: unknown = null;
  try {
    await mod.assertSafeTarget(new URL("https://olmene-qa-no-such-domain-7f3a91.com/"));
  } catch (e) {
    err = e;
  } finally {
    Object.defineProperty(Deno, "resolveDns", { value: original, configurable: true, writable: true });
  }
  assert(err instanceof mod.ScanError, String(err));
  const res = mod.scanFailure(err);
  assertEquals(res.code, "domain_not_found");
  assert(/couldn't find that domain/.test(res.message) && !/can't be scanned/.test(res.message));
  // Private targets keep the "can't be scanned" answer.
  assertEquals(mod.scanFailure(new mod.TargetRejected("private range")).code, "forbidden_target");
});

Deno.test("trust: unmarked testimonials (quoted sentence + name) and app awards count", () => {
  const s = signals(`<div>"Three years later, I'm still happy with the choice to shift to this platform."<a>Jeremy Singer-Vine</a></div>
    <div>"I didn't want to sign on with a place that was going to pursue that metastatic overgrowth."<a>Clive Thompson</a></div>`);
  assert(s.trustSignals.includes("customer quotes"), JSON.stringify(s.trustSignals));
  assert(signals(`<p>Editor's Choice 2020 · Apple Design Award</p>`).trustSignals.includes("awards"));
  assertEquals(signals(`<h2>"Ship faster with less" Product Tour</h2>`).trustSignals.includes("customer quotes"), false);
});
