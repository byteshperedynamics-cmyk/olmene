# Edge functions

Engine runbook (what runs where, release order, switches): ../../docs/engine.md

Engine v1 (2026-10-13) adds `notify`, `monitor` and `health-watch`, shared
helpers in `_shared/` (render, ledger, email — imported with relative paths,
bundled by `supabase functions deploy`), and Deno tests next to each function
(`deno test --allow-all supabase/functions`).

All eight originally deployed functions have their source here. `advance-analysis`,
`free-audit` and `polar-webhook` were already maintained in this folder; the
other five were recovered from the deployed bundles on 2026-10-08 (they are
single-file builds with their `_shared` helpers inlined, hence the plain-JS
style):

| Function | State |
|---|---|
| `start-analysis` | Changed on 2026-10-08: monthly quota windows for yearly plans, no hard-coded prices in the "no plan" message |
| `create-checkout`, `create-portal-session`, `sweeper` | As deployed |
| `health` | As deployed, with `_shared/auth.ts`'s `serviceClient()` inlined so the folder is self-contained |

Deploy one function (or let .github/workflows/deploy-functions.yml do it on main):

    npx supabase functions deploy <name> --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt

(`create-portal-session` is the one deployed with JWT verification on — omit
`--no-verify-jwt` for it.)
