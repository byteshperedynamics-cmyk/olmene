# free-audit

The free homepage scan behind olmene.com's hero. Source pulled from the deployed
function on 2026-10-02 and fixed after an accuracy evaluation on 26 real sites
(see docs/design/reports/pipeline-evaluation.md).

Deploy:

    npx supabase functions deploy free-audit --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt

Tests (Deno):

    deno test --node-modules-dir=none --allow-read --allow-write --allow-net --allow-env supabase/functions/free-audit/index.test.ts

`--node-modules-dir=none` matters when run from the repo root: without it, Deno
2.9+ sees the root package.json and looks for `npm:cheerio` in node_modules.
