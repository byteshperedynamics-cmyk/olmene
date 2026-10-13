#!/usr/bin/env node
/**
 * Gated production deploy (engine v2): the new Worker version gets NO
 * traffic until it passes the smoke test.
 *
 *  1. upload the build as a new version (wrangler versions upload);
 *  2. add it to the deployment at 0% beside the current version (1% if
 *     Cloudflare refuses 0%);
 *  3. run scripts/smoke.mjs against olmene.com with a version-override
 *     header, so only the new version answers;
 *  4. pass → new version 100%, smoke again; fail → current version 100%,
 *     exit 1 (the build shows red, production never saw the broken code).
 *
 * The 12 Oct outage (a build whose /api routes crashed at startup) would
 * have stopped at step 3. Use as the Workers Builds deploy command:
 *   npm run deploy:gated
 * Refuses to run outside CI like deploy:cf (scripts/guard-local-deploy.mjs).
 */
import { execFileSync, spawnSync } from "node:child_process";

const WORKER = process.env.OLMENE_WORKER_NAME ?? "olmene";
const BASE = process.env.OLMENE_SMOKE_URL ?? "https://olmene.com";
const wrangler = (args, opts = {}) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  return r.status === 0;
}

function currentVersion() {
  try {
    const out = JSON.parse(wrangler(["deployments", "status", "--json"]));
    const versions = out.versions ?? out.deployment?.versions ?? [];
    const top = [...versions].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0];
    return top?.version_id ?? top?.versionId ?? null;
  } catch {
    try {
      const text = wrangler(["deployments", "status"]);
      return text.match(/\(100%\)\s+([0-9a-f-]{36})/)?.[1] ?? text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;
    } catch {
      return null;
    }
  }
}

function deploy(specs, message) {
  wrangler(["versions", "deploy", ...specs, "-y", "--message", message.slice(0, 100)], { stdio: ["ignore", "inherit", "inherit"] });
}

async function smoke(version) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (run("node", ["scripts/smoke.mjs", BASE, ...(version ? ["--version", version, "--worker", WORKER] : [])])) return true;
    console.log(`  smoke attempt ${attempt} failed${attempt < 3 ? ", retrying in 10 s" : ""}`);
    if (attempt < 3) await sleep(10_000);
  }
  return false;
}

if (!run("node", ["scripts/guard-local-deploy.mjs"])) process.exit(1);

const message = (process.env.WORKERS_CI_COMMIT_MESSAGE ?? process.env.GITHUB_SHA ?? "gated deploy").split("\n")[0];
const previous = currentVersion();
console.log(`Current version: ${previous ?? "(none found)"}`);

const upload = wrangler(["versions", "upload", "--keep-vars", "--message", message.slice(0, 100)]);
process.stdout.write(upload);
const next = upload.match(/Version ID:\s*([0-9a-f-]{36})/i)?.[1];
if (!next) {
  console.error("✗ Could not read the new version id from `wrangler versions upload`.");
  process.exit(1);
}

if (!previous) {
  console.log("No current deployment found: deploying the new version directly, then smoke.");
  deploy([`${next}@100%`], message);
  process.exit((await smoke(null)) ? 0 : 1);
}

try {
  deploy([`${next}@0%`, `${previous}@100%`], `gate: ${message}`);
} catch {
  console.log("0% split refused; using 1% for the test window.");
  deploy([`${next}@1%`, `${previous}@99%`], `gate: ${message}`);
}
await sleep(5_000);
console.log(`\nSmoke test of version ${next} (version override, no customer traffic):`);
if (!(await smoke(next))) {
  console.error(`\n✗ Version ${next} failed the smoke test. Restoring ${previous} at 100%.`);
  deploy([`${previous}@100%`], `gate failed, kept ${previous.slice(0, 8)}`);
  process.exit(1);
}
deploy([`${next}@100%`], message);
await sleep(5_000);
console.log("\nSmoke test after promotion:");
if (!(await smoke(null))) {
  console.error(`\n✗ Production smoke failed after promotion. Rolling back to ${previous}.`);
  deploy([`${previous}@100%`], `rollback after promotion, back to ${previous.slice(0, 8)}`);
  process.exit(1);
}
console.log(`\n✓ ${next} is live.`);
