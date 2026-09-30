#!/usr/bin/env node
/**
 * Lighthouse mobile runner for Marketwise.
 *
 * Usage:
 *   node scripts/lighthouse_run.js <url> <outLabel> [--with-consent] [--lang=el]
 *
 * --with-consent: pre-warms a Chrome profile with the analytics consent
 * cookie set to "accepted" (emulates a returning visitor who accepted —
 * the scenario in the user's Lighthouse report where gtag.js loads).
 * --lang=xx: also pre-sets the language choice (emulates a returning
 * non-English visitor — the i18n dictionary chunk loads after hydration).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const url = process.argv[2];
const label = process.argv[3] || "run";
const withConsent = process.argv.includes("--with-consent");
const langArg = process.argv.find((a) => a.startsWith("--lang="));
const lang = langArg ? langArg.split("=")[1] : null;

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const PROFILE_DIR = `${process.env.HOME}/.cache/lighthouse-profile-${withConsent ? "consent" : "fresh"}${lang ? "-" + lang : ""}`;
const OUT_DIR = "/home/z/my-project/lighthouse";

async function prewarmProfile() {
  const { chromium } = require("playwright");
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem("mw-analytics-consent", "accepted");
    } catch (e) {}
  });
  if (lang) {
    await page.evaluate((l) => {
      try {
        localStorage.setItem("mw-lang", l);
      } catch (e) {}
    }, lang);
  }
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (withConsent || lang) {
    console.log(`Pre-warming profile (consent=${withConsent}, lang=${lang ?? "en"}) …`);
    await prewarmProfile();
  }

  const outJson = path.join(OUT_DIR, `${label}.report.json`);
  const outHtml = path.join(OUT_DIR, `${label}.report.html`);
  const res = spawnSync(
    "npx",
    [
      "--yes", "lighthouse", url,
      "--output=json", "html",
      `--output-path=${path.join(OUT_DIR, label)}`,
      "--form-factor=mobile",
      "--throttling-method=devtools",
      "--only-categories=performance,accessibility,best-practices,seo",
      `--chrome-path=${CHROME}`,
      `--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --user-data-dir=${PROFILE_DIR}`,
    ],
    { stdio: "inherit", env: { ...process.env, CHROME_PATH: CHROME } },
  );
  if (res.status !== 0) {
    console.error(`Lighthouse exited with ${res.status}`);
    process.exit(res.status ?? 1);
  }

  const report = JSON.parse(fs.readFileSync(outJson, "utf8"));
  const cats = report.categories;
  const a = report.audits;
  const row = (k) => `${k}: ${Math.round((a[k]?.numericValue ?? 0) / 10) / 100}s`;
  console.log("\n===== SCORES =====");
  for (const c of Object.keys(cats)) {
    console.log(`${cats[c].title}: ${Math.round((cats[c].score ?? 0) * 100)}`);
  }
  console.log("\n===== METRICS =====");
  console.log(row("first-contentful-paint"));
  console.log(row("largest-contentful-paint"));
  console.log(row("total-blocking-time"));
  console.log(`CLS: ${a["cumulative-layout-shift"]?.displayValue}`);
  console.log(row("speed-index"));

  // LCP element breakdown
  const lcpEl = a["largest-contentful-paint-element"];
  if (lcpEl?.details?.items?.length) {
    const item = lcpEl.details.items[0];
    console.log("\n===== LCP ELEMENT =====");
    console.log(JSON.stringify(item.items?.[0]?.node?.snippet || item, null, 2).slice(0, 2000));
    const phases = a["largest-contentful-paint-breakdown"]?.details?.items?.[0];
    if (phases) {
      console.log("Phases (ms):", JSON.stringify(phases, null, 2).slice(0, 800));
    }
  }
  // Save console path
  console.log(`\nReport JSON: ${outJson}`);
  console.log(`Report HTML: ${outHtml}`);
})();
