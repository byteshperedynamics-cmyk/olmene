// Kind-of-business detection, its checks, and search/link-card preview data.
//   deno test --allow-all supabase/functions/free-audit/business.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { analyzeBusiness, type BusinessInput, previewData } from "./business.ts";

const input = (html: string, extra: Partial<BusinessInput> = {}): BusinessInput => ({
  html, pageUrl: "https://example.org/", jsonLdTypes: [], isStore: false, hasPricingPage: false, ctaButtons: [], trustSignals: [], ...extra,
});

Deno.test("category: restaurant from structured data, with menu and reservation checks", () => {
  const html = `<html><body><a href="/menu">Our menu</a><p>Open Mon–Fri 12:00–22:00</p><a href="tel:+302101234567">Call</a></body></html>`;
  const r = analyzeBusiness(input(html, { jsonLdTypes: ["Restaurant"] }));
  assertEquals(r.category.id, "restaurant");
  assertEquals(r.category.confidence, "high");
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assertEquals(byId["biz-menu"], "pass");
  assertEquals(byId["biz-reservations"], "warn");
  assertEquals(byId["biz-hours"], "pass");
  assertEquals(byId["biz-phone"], "pass");
  assertEquals(byId["biz-schema"], "pass");
  assert(r.checks.every((c) => c.group === "Business"));
});

Deno.test("category: local business from phone, address, hours and a map", () => {
  const html = `<html><body><h1>Smith Plumbing</h1><a href="tel:+15551234">Call now</a>
  <p>123 Main Street, Springfield</p><p>Opening hours: Monday 8:00 - 18:00</p>
  <a href="https://maps.google.com/?q=smith">Directions</a></body></html>`;
  const r = analyzeBusiness(input(html));
  assertEquals(r.category.id, "local");
  const schema = r.checks.find((c) => c.id === "biz-schema");
  assertEquals(schema?.status, "warn");
  assertEquals(r.phoneLinks, 1);
});

Deno.test("category: online store, app, SaaS, content", () => {
  assertEquals(analyzeBusiness(input("<p>Add to cart</p>", { isStore: true })).category.id, "ecommerce");
  const app = analyzeBusiness(input(`<a href="https://apps.apple.com/us/app/acme/id1234567890">App Store</a>`));
  assertEquals(app.category.id, "app");
  assertEquals(app.appStoreId, "1234567890");
  assertEquals(app.checks.find((c) => c.id === "biz-smart-banner")?.status, "warn");
  const saas = analyzeBusiness(input(`<p>Dashboard, integrations and an API for teams.</p><a>Start free trial</a>`, { hasPricingPage: true, ctaButtons: ["Start free trial"] }));
  assertEquals(saas.category.id, "saas");
  assertEquals(saas.checks.find((c) => c.id === "biz-trial")?.status, "pass");
  const blog = analyzeBusiness(input(`<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>Latest posts</body></html>`));
  assertEquals(blog.category.id, "content");
  assertEquals(blog.checks.find((c) => c.id === "biz-feed")?.status, "pass");
});

Deno.test("category: navigation lists and software plans are not a shop", () => {
  // basecamp.com, 2026-10-29: WebPage, WebSite and an ItemList of nav links.
  const nav = analyzeBusiness(input(`<p>Project management for teams: to-dos, a dashboard, integrations and onboarding.</p><a href="/pricing">Pricing</a><a>Try it free</a>`, {
    jsonLdTypes: ["WebPage", "WebSite", "ItemList", "SiteNavigationElement"], hasPricingPage: true, ctaButtons: ["Try it free"],
  }));
  assertEquals(nav.category.id, "saas");
  const plans = analyzeBusiness(input(`<p>Analytics for teams.</p>`, { jsonLdTypes: ["SoftwareApplication", "Offer", "AggregateRating"], hasPricingPage: true }));
  assertEquals(plans.category.id, "saas");
  const shop = analyzeBusiness(input(`<p>Add to cart</p>`, { jsonLdTypes: ["Product", "Offer"] }));
  assertEquals(shop.category.id, "ecommerce");
  assertEquals(shop.checks.find((c) => c.id === "biz-product-schema")?.status, "pass");
  assertEquals(analyzeBusiness(input(`<p>Tickets</p>`, { jsonLdTypes: ["Offer"] })).category.id, "ecommerce");
});

Deno.test("saas trial: offered on another crawled page is a warning that names the page, not 'no trial'", () => {
  const base = { hasPricingPage: true, jsonLdTypes: ["SoftwareApplication"] };
  const none = analyzeBusiness(input(`<p>Analytics</p>`, base)).checks.find((c) => c.id === "biz-trial");
  assertEquals(none?.status, "warn");
  assert(none?.detail.startsWith("No free trial"));
  const other = analyzeBusiness(input(`<p>Analytics</p>`, { ...base, otherPages: [{ url: "https://example.org/pricing", text: "Pro: Try 14-day free trial" }] }))
    .checks.find((c) => c.id === "biz-trial");
  assertEquals(other?.status, "warn");
  assert(other?.detail.includes("/pricing"));
  const home = analyzeBusiness(input(`<a>Start free trial</a>`, base)).checks.find((c) => c.id === "biz-trial");
  assertEquals(home?.status, "pass");
});

Deno.test("category: nothing specific stays 'other' with no checks", () => {
  const r = analyzeBusiness(input("<p>Hello world</p>"));
  assertEquals(r.category.id, "other");
  assertEquals(r.checks.length, 0);
});

Deno.test("preview data: search result and link card", () => {
  const html = `<html><head><title>Acme — Analytics</title><meta name="description" content="Fast analytics.">
  <meta property="og:image" content="/og.png"><meta property="og:site_name" content="Acme"><link rel="icon" href="/icon.svg"></head></html>`;
  const p = previewData(html, "https://www.acme.com/pricing/");
  assertEquals(p.serp.title, "Acme — Analytics");
  assertEquals(p.serp.displayUrl, "acme.com › pricing");
  assertEquals(p.serp.favicon, "https://www.acme.com/icon.svg");
  assertEquals(p.social.image, "https://www.acme.com/og.png");
  assertEquals(p.social.title, "Acme — Analytics");
  assertEquals(p.social.host, "acme.com");
  assertEquals(previewData("<title>x</title>", "https://a.io/", true).serp.favicon, "https://a.io/favicon.ico");
});
