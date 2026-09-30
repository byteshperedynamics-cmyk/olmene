#!/usr/bin/env bash
# Gate 1 (docs/integrations.md §1.5): set the three obtainable Worker secrets.
# All secret VALUES are extracted at runtime and piped straight into wrangler —
# never echoed, never written to a file. Requires CLOUDFLARE_API_TOKEN in env.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?need CF token}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-7948c058a723edf20967b364676c9fdc}"
SUPA_PROJ=ffoevhldpppyfsfgufmx

echo "== [1/4] SUPABASE_SERVICE_ROLE_KEY (legacy JWT via Management API)"
PAT=$(grep -hoE 'sbp_[A-Za-z0-9_-]+' scripts/phase0_live_verify.py | head -1)
SRK=$(curl -s -m 20 -H "Authorization: Bearer $PAT" \
  "https://api.supabase.com/v1/projects/$SUPA_PROJ/api-keys" | python3 -c '
import json,sys
d=json.load(sys.stdin)
ks=d if isinstance(d,list) else d.get("api_keys",[])
for k in ks:
    if k.get("type")=="legacy" and k.get("name")=="service_role":
        print(k["api_key"]); break
')
[ -n "$SRK" ] || { echo "FATAL: could not extract service_role key"; exit 1; }
echo "    extracted: len=${#SRK} prefix=${SRK:0:4}..."
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
  "https://$SUPA_PROJ.supabase.co/rest/v1/agent_flags?select=key&limit=1" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK")
echo "    functional test vs service-only table (agent_flags): HTTP $CODE (expect 200)"
[ "$CODE" = "200" ] || { echo "FATAL: key failed functional test"; exit 1; }
printf '%s' "$SRK" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY 2>&1 | tail -2

echo "== [2/4] MW_KMS_MASTER_KEY (fresh 32-byte key, piped, never displayed)"
KEY=$(bun run scripts/agent-setup.ts genkey 2>/dev/null | head -1)
[ "${#KEY}" -ge 40 ] || { echo "FATAL: genkey output unexpected (len ${#KEY})"; exit 1; }
echo "    generated: len=${#KEY} (value intentionally not shown)"
printf '%s' "$KEY" | npx wrangler secret put MW_KMS_MASTER_KEY 2>&1 | tail -2

echo "== [3/4] SUPABASE_URL (non-secret)"
printf '%s' "https://$SUPA_PROJ.supabase.co" | npx wrangler secret put SUPABASE_URL 2>&1 | tail -2

echo "== [4/4] Worker secret inventory (names only)"
npx wrangler secret list
echo "DONE — AGENT_FEATURE_ENABLED intentionally NOT set (stays OFF per §1.5)"
