#!/usr/bin/env node
/**
 * Production deploys go through CI (Cloudflare Workers Builds: `npm ci`, the
 * locked dependency versions, no local env files). A laptop deploy on
 * 2026-10-12 shipped Next 16.4.0 instead of the locked 16.3.8 and took every
 * /api route down. `npm run deploy:cf` therefore refuses to run outside CI
 * unless the operator says so explicitly.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ci = process.env.CI || process.env.WORKERS_CI || process.env.CF_PAGES;
if (!ci && process.env.OLMENE_ALLOW_LOCAL_DEPLOY !== "1") {
  console.error(
    "✗ Refusing a local production deploy. Push to main and let CI deploy, or roll back with `npx wrangler rollback <version>`.\n" +
      "  Emergency only: OLMENE_ALLOW_LOCAL_DEPLOY=1 npm run deploy:cf (after `npm ci`).",
  );
  process.exit(1);
}

// Even when allowed: the installed Next.js must be the locked one.
const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
for (const name of ["next", "@opennextjs/cloudflare"]) {
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  let installed = null;
  try {
    installed = JSON.parse(readFileSync(require.resolve(`${name}/package.json`, { paths: [process.cwd()] }), "utf8")).version;
  } catch {
    installed = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8")).version;
  }
  if (locked && installed !== locked) {
    console.error(`✗ ${name} ${installed} is installed but package-lock.json pins ${locked}. Run \`npm ci\` first.`);
    process.exit(1);
  }
}
console.log("✓ Deploy guard passed.");
