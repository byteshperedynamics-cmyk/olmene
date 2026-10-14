// Unit tests for advance-analysis internals added in engine v1.
//   deno test --allow-all supabase/functions/advance-analysis/index.test.ts
// index.ts serves at import time, so the test loads a patched copy.
import { assert, assertEquals } from "jsr:@std/assert@1";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const patched = src
  .replace(/from "\.\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`../${f}`, import.meta.url).href}"`)
  .replace(/from "\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`./${f}`, import.meta.url).href}"`)
  .replace("Deno.serve(", "const __noServe = (") +
  "\nexport { groundCompetitorPrices, researchQueries, schemaOf, ProductProfile, brandToken, hostMatchesBrand, PARKED, chainNext, STEP_IDS };\n";
const tmp = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tmp, patched);
const mod = await import(`file://${tmp}`);

Deno.test("pipeline has 11 steps with gitdiff before assemble", () => {
  assertEquals(mod.STEP_IDS.length, 11);
  assertEquals(mod.STEP_IDS.slice(-2), ["gitdiff", "assemble"]);
});

Deno.test("competitor prices: kept only when the numbers appear on their page", () => {
  const pages = [
    { name: "Plausible", url: "https://plausible.io/", text: "Pricing starts at $9 per month for 10k pageviews" },
    { name: "Fathom", url: "https://usefathom.com/", text: "Simple, privacy-first analytics" },
  ];
  const out = mod.groundCompetitorPrices([
    { name: "Plausible", url: "https://plausible.io/", pricing: "From $9/month" },
    { name: "Fathom", url: "https://usefathom.com/", pricing: "From $15/month" },
    { name: "Other", url: "https://other.test/", pricing: "Contact sales" },
  ], pages);
  assertEquals(out[0].pricing, "From $9/month");
  assertEquals(out[1].pricing, null);
  assertEquals(out[2].pricing, "Contact sales");
});

Deno.test("research queries follow the business type (no 'software companies' for a shop)", () => {
  const base = { name: "Fernway", category: "leather journals", targetCustomers: ["writers"] };
  const shop = mod.researchQueries({ ...base, businessType: "ecommerce" }, "EU", 2026);
  assert(shop.every((q: string) => !q.includes("software")));
  assert(shop.some((q: string) => q.includes("shoppers")));
  const saas = mod.researchQueries({ ...base, category: "web analytics", businessType: "saas" }, "worldwide", 2026);
  assert(saas.some((q: string) => q.includes("software companies")));
  assertEquals(shop.length, 6);
});

Deno.test("profile: an unknown business type never fails validation", () => {
  const ok = mod.ProductProfile.safeParse({
    name: "Acme", category: "analytics", oneLiner: "Analytics for teams", offerings: ["a"], pricingModel: "subscription",
    targetCustomers: ["teams"], valueProps: ["fast"], tone: "plain", siteLanguage: "en", businessType: "spaceship",
  });
  assert(ok.success);
  assertEquals(ok.data.businessType, "other");
});

Deno.test("schemas are sent compact (no pretty-print whitespace)", () => {
  const json = mod.schemaOf(mod.ProductProfile);
  assert(!json.includes("\n"));
});

Deno.test("parked-domain pages are recognised", () => {
  assert(mod.PARKED.test("This domain is for sale! Buy this domain today"));
  assert(!mod.PARKED.test("Plausible is a simple, privacy-friendly analytics tool"));
  assert(mod.hostMatchesBrand("plausible.io", "Plausible"));
  assertEquals(mod.brandToken("Pixee AI"), "pixee");
});

Deno.test("chainNext only fires for successful mid-pipeline units", async () => {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((u: string) => {
    calls.push(String(u));
    return Promise.resolve(new Response(null, { status: 202 }));
  }) as typeof fetch;
  try {
    const env = { SUPABASE_URL: "https://x.supabase.co", CRON_SECRET: "s".repeat(32) };
    await mod.chainNext(env, "job-1", { status: "running", chain: true });
    await mod.chainNext(env, "job-1", { status: "queued" }); // retry/backoff: no chain
    await mod.chainNext(env, "job-1", { status: "completed" });
    await mod.chainNext({ ...env, CRON_SECRET: "" }, "job-1", { status: "running", chain: true });
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(calls, ["https://x.supabase.co/functions/v1/advance-analysis"]);
});
