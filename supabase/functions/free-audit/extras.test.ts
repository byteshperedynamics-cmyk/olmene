// Tests for the free-scan additions (platform, extra checks, JS shells).
//   deno test --allow-all supabase/functions/free-audit/extras.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { blockedAiCrawlers, cwvStatus, detectPlatform, internalLinkSample, ogImageUrl, renderBlockingScripts, runExtraChecks } from "./extras.ts";
import { looksLikeJsShell } from "../_shared/render.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const patched = src
  .replace(/from "\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`./${f}`, import.meta.url).href}"`)
  .replace(/from "\.\.\/([^"]+)"/g, (_m, f) => `from "${new URL(`../${f}`, import.meta.url).href}"`)
  .replace("Deno.serve(", "const __noServe = (") +
  "\nexport { computeSeoSignals, mergeRendered, markContentUnmeasured, buildFindings };\n";
const tmp = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tmp, patched);
const mod = await import(`file://${tmp}`);
const crawl = { robotsTxtOk: true, sitemapXmlOk: true, sitemapUrl: null, faviconIcoOk: true };

const viteShell = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Acme</title>
<meta name="description" content="Acme helps small teams ship analytics in a day without a data team."/>
<script type="module" crossorigin src="/assets/index-DkQ2.js"></script></head><body><div id="root"></div></body></html>`;

Deno.test("platform: fix modes — guided everywhere, API for Webflow/WordPress, PR for code", () => {
  assertEquals(detectPlatform('<meta name="generator" content="WordPress 6.6">').fixModes, ["api", "guided"]);
  assertEquals(detectPlatform('<html data-wf-site="abc">').fixModes, ["api", "guided"]);
  assertEquals(detectPlatform('<link href="https://cdn.shopify.com/s/files/x.css">').fixModes, ["guided"]);
  assertEquals(detectPlatform('<div class="hs_cos_wrapper"></div>').id, "hubspot");
  assertEquals(detectPlatform('<script src="https://js.hs-scripts.com/123.js"></script><script src="/_next/static/a.js"></script>').id, "nextjs-app");
  assertEquals(detectPlatform('<img src="https://irp.cdn-website.com/x.jpg">').id, "duda");
  assertEquals(detectPlatform('<div class="t-records"></div>').id, "tilda");
  assertEquals(detectPlatform('<script src="/_nuxt/entry.js"></script>').fixModes, ["pr", "guided"]);
  assertEquals(detectPlatform('<script>__sveltekit_abc = {}</script><link href="/_app/immutable/a.css">').id, "sveltekit");
  assertEquals(detectPlatform('<app-root ng-version="18.0.0"></app-root>').id, "angular");
  assertEquals(detectPlatform('<script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/static/a.js"></script>'.toLowerCase()).fixable, "yes");
});

Deno.test("platform: hosted builders are not fixable by PR", () => {
  assertEquals(detectPlatform('<link href="https://cdn.shopify.com/s/files/x.css">').id, "shopify");
  assertEquals(detectPlatform('<meta name="generator" content="WordPress 6.6">').fixable, "no");
  assertEquals(detectPlatform('<html data-wf-site="abc">').id, "webflow");
  assertEquals(detectPlatform('<script src="https://framerusercontent.com/x.js"></script>').id, "framer");
});

Deno.test("platform: Next.js App vs Pages Router, Astro, Vite SPA, static", () => {
  assertEquals(detectPlatform('<script>self.__next_f.push([1,""])</script><script src="/_next/static/chunks/a.js"></script>').id, "nextjs-app");
  assertEquals(detectPlatform('<script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/static/x.js"></script>').id, "nextjs-pages");
  assertEquals(detectPlatform('<link rel="stylesheet" href="/_astro/index.css">').fixable, "yes");
  assertEquals(detectPlatform(viteShell).id, "vite-react");
  assertEquals(detectPlatform("<html><body><h1>Hello</h1><p>Plain page</p></body></html>").id, "static");
});

Deno.test("robots.txt: AI crawler groups, star fallback, Allow: / overrides", () => {
  const r = blockedAiCrawlers("User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n");
  assertEquals(r.blocked.sort(), ["CCBot", "ClaudeBot", "GPTBot"]);
  assertEquals(r.allBlocked, false);
  assertEquals(blockedAiCrawlers("User-agent: *\nDisallow: /\n").allBlocked, true);
  assertEquals(blockedAiCrawlers("User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n").blocked.includes("GPTBot"), false);
  assertEquals(blockedAiCrawlers(null).blocked, []);
});

Deno.test("head helpers: render-blocking scripts, og:image, internal links", () => {
  assertEquals(renderBlockingScripts('<head><script src="a.js"></script><script async src="b.js"></script><script defer src="c.js"></script><script type="module" src="d.js"></script></head>'), 1);
  assertEquals(ogImageUrl('<meta property="og:image" content="/og.png">', "https://acme.test/"), "https://acme.test/og.png");
  assertEquals(internalLinkSample('<a href="/pricing">p</a><a href="/pricing#x">p</a><a href="https://x.test/">x</a><a href="mailto:a@b">m</a><a href="/doc.pdf">d</a>', "https://acme.test/"), ["https://acme.test/pricing"]);
});

Deno.test("Core Web Vitals thresholds", () => {
  assertEquals(cwvStatus({ lcpMs: 2100, inpMs: 150, cls: 0.05 }).status, "pass");
  assertEquals(cwvStatus({ lcpMs: 3100, inpMs: 150, cls: 0.05 }).status, "warn");
  assertEquals(cwvStatus({ lcpMs: 2100, inpMs: 650, cls: 0.05 }).status, "fail");
});

Deno.test("JS shell: a Vite root div is a shell, a real page is not", () => {
  assert(looksLikeJsShell(viteShell, 1));
  assert(!looksLikeJsShell("<html><body><div id=root><h1>Hi</h1></div></body></html>", 400));
});

Deno.test("unrendered shell: content checks become 'not measured', head checks stay", () => {
  const s = mod.markContentUnmeasured(mod.computeSeoSignals(viteShell, "https://acme.test/", crawl));
  const by = (c: string) => s.checklist.find((x: { check: string }) => x.check === c);
  assertEquals(by("Call-to-action").status, "warn");
  assert(by("Call-to-action").detail.startsWith("Not measured"));
  assertEquals(by("Meta description").status, "pass"); // raw head is what crawlers see
});

Deno.test("rendered shell: content from the rendered DOM, head from the raw HTML", () => {
  const raw = mod.computeSeoSignals(viteShell, "https://acme.test/", crawl);
  const renderedHtml = `<html><head><title>Changed by JS</title></head><body><h1>Analytics in a day</h1><p>${"word ".repeat(320)}</p><a href="/signup">Start free</a><a href="/pricing">Pricing</a><p>Trusted by 500 teams. Customer reviews.</p></body></html>`;
  const merged = mod.mergeRendered(raw, mod.computeSeoSignals(renderedHtml, "https://acme.test/", crawl));
  assertEquals(merged.h1Count, 1);
  assertEquals(merged.titleText, "Acme");
  assert(merged.wordCount > 300);
  assertEquals(merged.checklist.find((c: { check: string }) => c.check === "Call-to-action").status, "pass");
});

Deno.test("extra checks runner: works offline with a stub fetch and respects the budget", async () => {
  const fetchStub = async (u: string) => {
    if (u.endsWith("/llms.txt")) return new Response("# Acme", { status: 200, headers: { "content-type": "text/plain" } });
    if (u.startsWith("http://")) return new Response(null, { status: 301, headers: { location: "https://acme.test/" } });
    if (u.includes("www.")) return new Response(null, { status: 308, headers: { location: "https://acme.test/" } });
    if (u.endsWith("/og.png")) return new Response("x", { status: 200, headers: { "content-type": "image/png", "content-length": "2048" } });
    if (u.endsWith("/missing")) return new Response("no", { status: 404 });
    return new Response("ok", { status: 200 });
  };
  const html = '<html><head><meta property="og:image" content="/og.png"></head><body><a href="/pricing">p</a><a href="/missing">m</a></body></html>';
  const out = await runExtraChecks({ pageUrl: "https://acme.test/", html, htmlBytes: html.length, robotsTxt: "User-agent: GPTBot\nDisallow: /", fetch: fetchStub });
  const by = (id: string) => out.find((c) => c.id === id);
  assertEquals(by("ai-crawlers")?.status, "warn");
  assertEquals(by("llms-txt")?.status, "pass");
  assertEquals(by("https-redirect")?.status, "pass");
  assertEquals(by("host-consistency")?.status, "pass");
  assertEquals(by("og-image")?.status, "pass");
  assertEquals(by("broken-links")?.status, "fail");
});
