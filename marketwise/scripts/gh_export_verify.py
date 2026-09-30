#!/usr/bin/env python3
"""Verify the GitHub export remotely: tree contents, exclusions, redactions.
Usage: GH_PAT=<pat> python3 scripts/gh_export_verify.py"""
import base64, json, os, sys, urllib.request

PAT = os.environ["GH_PAT"]
API = "https://api.github.com/repos/kalyntwork-max/market"

def get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json",
        "User-Agent": "mw-verify"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

t = get(f"{API}/git/trees/main?recursive=1")
blobs = [e for e in t["tree"] if e["type"] == "blob"]
print(f"remote tree: {len(blobs)} files, truncated={t['truncated']}")
paths = {e["path"] for e in blobs}

must_have = ["README.md", "docs/worklog.md", "docs/architecture-audit.md", "docs/integrations.md",
             "reports/real_report_data.json", "reports/sample_report_fixture.json",
             "reports/Polar-review-reply-draft.docx", "research/polar_openapi.json",
             "qa/shots/task13-home-desktop.png", "src/app/page.tsx", "package.json",
             "wrangler.jsonc", "supabase/migrations/20260929_agent_phase1.sql",
             "qa/jschunks/12daa96885968840.js", "qa/scratch/vlm-demo.json",
             "scripts/phase0_live_verify.py", "public/video/marketwise-demo.mp4",
             "fnsrc/sa_index.ts", "src/lib/agent/runner.ts"]
miss = [p for p in must_have if p not in paths]
print(f"presence: {len(must_have)-len(miss)}/{len(must_have)}" + (f"  MISSING: {miss}" if miss else ""))

must_absent = [".env", "scripts/polar_webhook_secret.txt", "fnsrc/create-checkout",
               "fnsrc/start-analysis", "fnsrc/polar-webhook", "fnsrc/sweeper",
               "fnsrc/advance-analysis.eszip", "fnsrc/sweeper.eszip", ".push-probe"]
leak = [p for p in must_absent if p in paths]
print(f"exclusions: {len(must_absent)-len(leak)}/{len(must_absent)} clean" + (f"  LEAKED: {leak}" if leak else ""))

def content(p):
    j = get(f"{API}/contents/{p}")
    return base64.b64decode(j["content"]).decode("utf-8", "replace")

checks = [
    ("scripts/phase0_live_verify.py", "sbp_REDACTED_FOR_EXPORT", "sbp_fc"),
    ("research/polar_openapi.json",   "whsec_REDACTED_FOR_EXPORT", "whsec_"),
    ("scripts/test_auth_combos.py",   "cfat_REDACTED_FOR_EXPORT", "cfat_8"),
]
ok = True
for p, needle, leftover in checks:
    c = content(p)
    has = needle in c
    clean = leftover not in c
    if not (has and clean): ok = False
    print(f"redaction {p}: marker={'YES' if has else 'NO!!'} leftover={'none' if clean else 'FOUND!!'}")

print("VERIFY:", "PASS" if (not miss and not leak and ok) else "FAIL")
sys.exit(0 if (not miss and not leak and ok) else 1)
