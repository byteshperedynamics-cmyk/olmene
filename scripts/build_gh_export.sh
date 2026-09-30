#!/usr/bin/env bash
# Build the sanitized, organized GitHub export of MarketWise in scratch/gh-export.
# - Exact tracked set via git archive (plus the new export helper scripts)
# - Organized layout: reports/ research/ qa/ docs/ + app code at root
# - Live secrets redacted (see gh_export_redact.py); .env / polar secret file /
#   binary edge-function bundles excluded (bundles are regenerable build artifacts
#   that cannot be safely redacted)
# - Fresh README + adjusted .gitignore, then a final secret scan that must pass
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EXPORT="$ROOT/scratch/gh-export"

echo "== [1/7] Fresh export of tracked set"
rm -rf "$EXPORT"; mkdir -p "$EXPORT"
git archive HEAD | tar -x -C "$EXPORT"
mkdir -p "$EXPORT/scripts"
cp scripts/gh_market_probe.py scripts/gh_export_scan.py scripts/gh_export_redact.py "$EXPORT/scripts/"

echo "== [2/7] Organize layout"
cd "$EXPORT"
mkdir -p reports research qa docs
mv real_report_data.json sample_report_fixture.json reports/
mv download/Polar-review-reply-draft.docx download/README.md reports/ && rmdir download
mv search1.json search2.json search3.json search4.json search5.json search6.json search7.json search8.json research/
mv openrouter_models.json mgmt_openapi.json polar_openapi.json polar_llms.txt gemini_limits.md website_body.txt research/
mv cf_pricing.html gemini_limits.html gemini_pricing.html groq_limits.html research/
mv polar_delivery.md research/
mv scripts/foldfx_search.json scripts/foldfx_search2.json research/
mv worklog.md docs/worklog.md
mv shots qa/shots
mv lighthouse qa/lighthouse

echo "== [3/7] Exclusions"
rm -f .env scripts/polar_webhook_secret.txt
rm -f fnsrc/create-checkout fnsrc/start-analysis fnsrc/polar-webhook \
      fnsrc/create-portal-session fnsrc/sweeper fnsrc/env-probe \
      fnsrc/advance-analysis.eszip fnsrc/sweeper.eszip

echo "== [4/7] Redact secrets"
python3 "$ROOT/scripts/gh_export_redact.py" "$EXPORT"

echo "== [5/7] .gitignore (keep tracked html/eszip; ignore env + secret files)"
grep -v -e '^\*\.html$' -e '^fnsrc/\*\.eszip$' .gitignore > .gitignore.tmp
cat >> .gitignore.tmp <<'EOF'
scripts/polar_webhook_secret.txt
EOF
mv .gitignore.tmp .gitignore

echo "== [6/7] Final secret scan (must be clean)"
python3 "$ROOT/scripts/gh_export_scan.py" --path "$EXPORT" | grep -v 'KEEP(test-fixture)' | grep 'REDACT\|REVIEW' && {
  echo "FATAL: unredacted secrets remain"; exit 1; } || true
echo "  clean"

echo "== [7/7] Export summary"
echo "  files: $(find . -type f | wc -l)"
echo "  size:  $(du -sh . | cut -f1)"
