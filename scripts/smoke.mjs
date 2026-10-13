#!/usr/bin/env node
/**
 * Post-deploy smoke test: the pages and the Worker's API routes answer the
 * way they should. Server routes return 5xx when the Worker cannot start,
 * while prerendered pages keep working, so both kinds are checked.
 *
 * usage: node scripts/smoke.mjs [baseUrl] [--version <id>] [--worker <name>]
 *   --version: send the requests to that Worker version only (Cloudflare
 *   version overrides), to test a version before it takes traffic.
 */
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const base = (args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? "https://olmene.com").replace(/\/$/, "");
const version = flag("--version");
const worker = flag("--worker") ?? "olmene";
const headers = { "User-Agent": "olmene-smoke/1.0", ...(version ? { "Cloudflare-Workers-Version-Overrides": `${worker}="${version}"` } : {}) };

const checks = [
  { path: "/", ok: (r) => r.status === 200, want: "200" },
  { path: "/pricing/", ok: (r) => r.status === 200, want: "200" },
  {
    path: "/api/public/stats/",
    ok: async (r) => r.status === 200 && typeof (await r.json().catch(() => ({}))).freeScans === "number",
    want: "200 with stats JSON",
  },
  // Signed-out: 401, or 503 when the agent is switched off. Never a crash.
  { path: "/api/agent/config/", ok: (r) => r.status === 401 || r.status === 503, want: "401/503" },
  // Starts Google sign-in: a redirect (or a handled 4xx), never a crash.
  { path: "/api/auth/google/", ok: (r) => r.status < 500, want: "<500" },
];

let failed = 0;
for (const c of checks) {
  let status = "ERR";
  let pass = false;
  try {
    const r = await fetch(base + c.path, { redirect: "manual", headers });
    status = String(r.status);
    pass = await c.ok(r);
  } catch (e) {
    status = `ERR ${e?.message ?? e}`;
  }
  console.log(`${pass ? "✓" : "✗"} ${c.path} → ${status} (want ${c.want})`);
  if (!pass) failed++;
}
if (failed) {
  console.error(`\n${failed} check(s) failed on ${base}${version ? ` (version ${version})` : ""}. Roll back: npx wrangler deployments list && npx wrangler rollback <version>`);
  process.exit(1);
}
