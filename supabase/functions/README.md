# Edge functions

All eight deployed functions now have their source here. `advance-analysis`,
`free-audit` and `polar-webhook` were already maintained in this folder; the
other five were recovered from the deployed bundles on 2026-10-08 (they are
single-file builds with their `_shared` helpers inlined, hence the plain-JS
style):

| Function | State |
|---|---|
| `start-analysis` | Changed on 2026-10-08: monthly quota windows for yearly plans, no hard-coded prices in the "no plan" message |
| `create-checkout`, `create-portal-session`, `sweeper` | As deployed |
| `health` | As deployed, with `_shared/auth.ts`'s `serviceClient()` inlined so the folder is self-contained |

Deploy one function:

    npx supabase functions deploy <name> --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt

(`create-portal-session` is the one deployed with JWT verification on — omit
`--no-verify-jwt` for it.)
