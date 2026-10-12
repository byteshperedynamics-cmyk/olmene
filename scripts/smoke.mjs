#!/usr/bin/env node
/**
 * Post-deploy smoke test: the pages and the Worker's API routes answer the
 * way they should. Server routes return 5xx when the Worker cannot start,
 * while prerendered pages keep working, so both kinds are checked.
 *
 * usage: node scripts/smoke.mjs [baseUrl]   (default https://olmene.com)
 */
const base = (process.argv[2] ?? "https://olmene.com").replace(/\/$/, "");

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
    const r = await fetch(base + c.path, { redirect: "manual", headers: { "User-Agent": "olmene-smoke/1.0" } });
    status = String(r.status);
    pass = await c.ok(r);
  } catch (e) {
    status = `ERR ${e?.message ?? e}`;
  }
  console.log(`${pass ? "✓" : "✗"} ${c.path} → ${status} (want ${c.want})`);
  if (!pass) failed++;
}
if (failed) {
  console.error(`\n${failed} check(s) failed on ${base}. Roll back: npx wrangler deployments list && npx wrangler rollback <version>`);
  process.exit(1);
}
