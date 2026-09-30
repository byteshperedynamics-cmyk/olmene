#!/usr/bin/env bash
# Deploy the MarketWise frontend to Cloudflare Workers.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy_frontend.sh
#
# Optional env overrides:
#   CLOUDFLARE_ACCOUNT_ID  (defaults to the MarketWise account)
#   SKIP_BUILD=1           (skip OpenNext build if .open-next/ is already built)
#
# Required token permissions (User token "Edit Cloudflare Workers" template,
# or an Account API token with these groups):
#   - Workers Scripts: Edit
#   - Workers Deployments: Edit
#   - Account Settings: Read
set -euo pipefail
cd "$(dirname "$0")/.."

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-7948c058a723edf20967b364676c9fdc}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set."
  echo "Create a token at https://dash.cloudflare.com/profile/api-tokens"
  echo "(template: 'Edit Cloudflare Workers'), then run:"
  echo "  CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy_frontend.sh"
  exit 1
fi

echo "==> Verifying token..."
npx wrangler whoami 2>/dev/null | grep -E "associated with|Account" || true

if [[ "${SKIP_BUILD:-0}" != "1" || ! -f .open-next/worker.js ]]; then
  echo "==> Building OpenNext bundle..."
  npx opennextjs-cloudflare build
else
  echo "==> Skipping build (SKIP_BUILD=1, bundle present)"
fi

echo "==> Deploying worker 'get'..."
npx wrangler deploy

echo ""
echo "==> Verifying deployment..."
sleep 5
for i in 1 2 3 4 5; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 https://get.marketwiselabs.workers.dev/ || echo "000")
  if [[ "$CODE" == "200" ]]; then
    echo "LIVE: https://get.marketwiselabs.workers.dev/ (HTTP $CODE)"
    curl -s -m 20 https://get.marketwiselabs.workers.dev/ | grep -o "Know exactly what to fix" | head -1 && echo "New version confirmed live."
    exit 0
  fi
  echo "  attempt $i: HTTP $CODE, waiting..."
  sleep 8
done
echo "WARN: site did not return 200 yet — check 'npx wrangler deployments list' and logs."
exit 1
