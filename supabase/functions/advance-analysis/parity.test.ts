// The free scan and the full report each carry a copy of the 21 checks
// (free-audit/index.ts and advance-analysis/index.ts). This test keeps them
// in step: same pages in, same check statuses out. If it fails, a change was
// made to one copy only.
//   deno test --allow-all supabase/functions/advance-analysis/parity.test.ts
import { assertEquals } from "jsr:@std/assert@1";

async function load(file: string, exports: string) {
  const src = await Deno.readTextFile(new URL(file, import.meta.url));
  const patched = src
    .replace(/from "\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`${file.replace(/[^/]+$/, "")}${f}`, import.meta.url).href}"`)
    .replace(/from "\.\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`../${f}`, import.meta.url).href}"`)
    .replace("Deno.serve(", "const __noServe = (") + `\nexport { ${exports} };\n`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, patched);
  return await import(`file://${tmp}`);
}

const scan = await load("../free-audit/index.ts", "computeSeoSignals");
const pipe = await load("./index.ts", "computeSeoSignals");
const crawl = { robotsTxtOk: true, sitemapXmlOk: false, sitemapUrl: null, faviconIcoOk: false };

const PAGES: Record<string, string> = {
  saas: `<html lang="en"><head><title>Acme — analytics for small teams</title><meta name="description" content="Acme shows small teams where users drop off and how to fix it, in one afternoon."><link rel="canonical" href="https://acme.test/"><meta name="viewport" content="width=device-width"><meta property="og:title" content="Acme"><meta property="og:image" content="/og.png"></head><body><h1>Know where users drop off</h1><h2>Setup in minutes</h2><h2>Pricing</h2><h3>FAQ</h3><a href="/signup">Start free</a><a href="/pricing">Pricing</a><p>Trusted by 400 teams. Customer reviews: 4.8/5 on G2.</p><img src="a.png" alt="dashboard"><p>${"word ".repeat(320)}</p></body></html>`,
  store: `<html><head><title>Fernway</title><script type="application/ld+json">{"@type":"Product","name":"Journal"}</script></head><body><h1>Refillable journals</h1><a href="/products/a">A</a><a href="/products/b">B</a><a href="/products/c">C</a><p>€29,00 €35,00 €42,00 €19,00 Add to cart</p><p>Free shipping and 30-day returns</p></body></html>`,
  saasPlans: `<html><head><title>Acme</title><script type="application/ld+json">{"@type":"SoftwareApplication","name":"Acme","offers":{"@type":"Offer","price":"19"}}</script><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"SiteNavigationElement","name":"Pricing","url":"/pricing"}]}</script></head><body><h1>Analytics for teams</h1><p>$19 / month. $49 / month. $99 / month. $199 / month.</p><a href="/signup">Start free</a></body></html>`,
  bare: `<html><head></head><body><p>Hello</p><img src="x.png"><img src="y.png"></body></html>`,
  local: `<html lang="de"><head><title>Zahnarzt Müller in Köln</title></head><body><h1>Ihre Zahnarztpraxis</h1><a href="/termin">Termin buchen</a><p>Kundenstimmen: sehr zufrieden. Bewertungen 4,9 von 5 Sternen</p></body></html>`,
};

for (const [name, html] of Object.entries(PAGES)) {
  Deno.test(`checks agree: ${name}`, () => {
    const a = scan.computeSeoSignals(html, "https://acme.test/", crawl).checklist.map((c: { check: string; status: string }) => `${c.check}=${c.status}`);
    const b = pipe.computeSeoSignals(html, "https://acme.test/", crawl).checklist.map((c: { check: string; status: string }) => `${c.check}=${c.status}`);
    assertEquals(b, a);
  });
}
