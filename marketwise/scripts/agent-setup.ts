#!/usr/bin/env bun
/**
 * Agent setup helper.
 *
 *   bun run scripts/agent-setup.ts genkey   → print a fresh MW_KMS_MASTER_KEY
 *   bun run scripts/agent-setup.ts check    → verify local env has everything
 *
 * The master key encrypts provider credentials at rest (envelope encryption).
 * It exists ONLY as a Worker secret — never in the DB, repo, or logs.
 */

import { generateMasterKey } from "../src/lib/agent/crypto";

const cmd = process.argv[2];

if (cmd === "genkey") {
  console.log(generateMasterKey());
  console.error(
    "\nStore this as a Worker secret (never in the repo or DB):\n" +
      "  npx wrangler secret put MW_KMS_MASTER_KEY   # then paste the key\n" +
      "and locally in .dev.vars\n",
  );
} else if (cmd === "check") {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MW_KMS_MASTER_KEY",
    "GLM_API_KEY",
  ];
  const optional = ["AGENT_FEATURE_ENABLED", "GEMINI_API_KEY", "AGENT_LLM_DAILY_CAP"];
  let ok = true;
  console.log("Agent environment check\n");
  for (const k of required) {
    const present = Boolean(process.env[k]);
    if (!present) ok = false;
    console.log(`  ${present ? "OK  " : "MISS"} ${k}`);
  }
  for (const k of optional) {
    console.log(`  ${process.env[k] ? "OK  " : "----"} ${k} (optional)`);
  }
  console.log(
    `\nFeature flag AGENT_FEATURE_ENABLED=${process.env.AGENT_FEATURE_ENABLED ?? "(unset → OFF)"}\n` +
      (ok
        ? "All required secrets present."
        : "Missing required secrets — see .dev.vars.example / docs/integrations.md §1.3."),
  );
  process.exit(ok ? 0 : 1);
} else {
  console.log("Usage: bun run scripts/agent-setup.ts genkey|check");
}
