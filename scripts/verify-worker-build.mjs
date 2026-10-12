#!/usr/bin/env node
/**
 * Pre-deploy gate for the OpenNext Worker bundle. Runs from wrangler.jsonc's
 * build.command, so it guards every `wrangler deploy` (CI and laptop alike).
 *
 * Fails the deploy when:
 *  1. Next.js loads a server manifest that the Cloudflare adapter did not
 *     inline. On 2026-10-12 a build with Next 16.4.0 shipped without
 *     `.next/server/preview-props.json`, and every /api route crashed at
 *     startup with "Unexpected loadManifest(...) call!" (error 1101).
 *  2. Server secrets or local-only flags were bundled from .env.local into
 *     .open-next/cloudflare/next-env.mjs (same incident: the laptop build
 *     carried the service-role key, the KMS key and the Measure flag).
 *
 * usage: node scripts/verify-worker-build.mjs [projectRoot]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const fnDir = join(root, ".open-next/server-functions/default");
const errors = [];

// ── 1. Every top-level server manifest must be inlined into the handler ──
const handlerPath = join(fnDir, "handler.mjs");
const serverDir = join(fnDir, ".next/server");
if (!existsSync(handlerPath) || !existsSync(serverDir)) {
  errors.push(`OpenNext output missing (${handlerPath}). Run \`npx opennextjs-cloudflare build\` first.`);
} else {
  const handler = readFileSync(handlerPath, "utf8");
  // Manifests the adapter answers with {} when absent (Next loads them with handleMissing).
  const optional = /(react-loadable-manifest|subresource-integrity-manifest|server-reference-manifest|dynamic-css-manifest|fallback-build-manifest|prefetch-hints)(\.json)?$/;
  for (const name of readdirSync(serverDir).filter((f) => f.endsWith(".json"))) {
    if (handler.includes(`endsWith("/server/${name}")`)) continue;
    if (optional.test(name)) continue;
    errors.push(
      `.next/server/${name} is not inlined into the Worker. Next.js will call loadManifest() for it and every server route ` +
        `will crash (error 1101). Use the Next.js version from package-lock.json (\`npm ci\`), or upgrade @opennextjs/cloudflare to a version that supports it.`,
    );
  }
}

// ── 2. No server secrets or local-only flags in the bundled env ──────────
const envPath = join(root, ".open-next/cloudflare/next-env.mjs");
if (existsSync(envPath)) {
  const names = [...readFileSync(envPath, "utf8").matchAll(/"([A-Z][A-Z0-9_]{2,})"\s*:/g)].map((m) => m[1]);
  const forbidden = [...new Set(names)].filter(
    (n) => !n.startsWith("NEXT_PUBLIC_") || n === "NEXT_PUBLIC_FEATURE_MEASURE",
  );
  // NEXT_PUBLIC_FEATURE_MEASURE is allowed only when .env.production (committed) sets it.
  const committed = existsSync(join(root, ".env.production")) ? readFileSync(join(root, ".env.production"), "utf8") : "";
  const leaked = forbidden.filter((n) => !new RegExp(`^${n}=`, "m").test(committed));
  if (leaked.length) {
    errors.push(
      `The Worker bundle contains env values that are not in .env.production: ${leaked.join(", ")}. ` +
        `They came from a local env file (usually .env.local). Rename it to .env.development.local and rebuild.`,
    );
  }
}
for (const local of [".env.local", ".env.production.local"]) {
  if (existsSync(join(root, local)) && !process.env.OLMENE_ALLOW_LOCAL_ENV) {
    errors.push(`${local} exists: production builds read it. Rename it to .env.development.local before building for deploy.`);
  }
}

if (errors.length) {
  console.error("\n✗ Worker build check failed — deploy stopped:\n");
  for (const e of errors) console.error(`  - ${e}\n`);
  process.exit(1);
}
console.log("✓ Worker build check passed (server manifests inlined, no local env bundled).");
