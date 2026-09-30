#!/usr/bin/env python3
"""Scan the LOCAL tracked file set for secret patterns before GitHub export.
Never prints full secret values — only file + kind + first 4 chars.
Usage: python3 scripts/gh_export_scan.py [--path DIR]"""
import re, subprocess, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCAN_DIR = sys.argv[sys.argv.index("--path") + 1] if "--path" in sys.argv else ROOT
if SCAN_DIR == ROOT:
    files = subprocess.run(["git", "-C", ROOT, "ls-files", "-z"], capture_output=True, text=True).stdout
    tracked = [f for f in files.split("\0") if f]
else:
    tracked = []
    for dp, _, names in os.walk(SCAN_DIR):
        if "/.git" in dp: continue
        for n in names:
            tracked.append(os.path.relpath(os.path.join(dp, n), SCAN_DIR))

# (name, regex, redaction replacement) — redaction applied ONLY outside tests/fixtures
PATTERNS = [
    ("supabase_pat",  re.compile(r"sbp_[A-Za-z0-9_\-]{20,}"),                        "sbp_REDACTED_FOR_EXPORT"),
    ("github_pat",    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),                   "github_pat_REDACTED_FOR_EXPORT"),
    ("cf_token",      re.compile(r"cfat_[A-Za-z0-9]{20,}"),                          "cfat_REDACTED_FOR_EXPORT"),
    ("gh_install",    re.compile(r"\bghs_[A-Za-z0-9_]{20,}"),                        "ghs_REDACTED_FOR_EXPORT"),
    ("polar_whsec",   re.compile(r"whsec_[A-Za-z0-9]{20,}"),                         "whsec_REDACTED_FOR_EXPORT"),
    ("supabase_jwt",  re.compile(r"eyJ[A-Za-z0-9_\-]{40,}\.[A-Za-z0-9_\-]{40,}\.[A-Za-z0-9_\-]{20,}"), "REDACTED_JWT_FOR_EXPORT"),
    ("r2_or_hexkey",  re.compile(r"(?i)(access_key_id|secret_access_key)['\"]?\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{24,}"), None),
]

SKIP_SUFFIX = ("/.gitignore",)
def is_test(p):
    return ("__tests__" in p) or p.endswith("fixtures.ts")

def is_binary(b):
    return b"\x00" in b[:4096]

counts, redactions = {}, []
for rel in sorted(tracked):
    full = os.path.join(SCAN_DIR, rel) if SCAN_DIR != ROOT else os.path.join(ROOT, rel)
    if rel.endswith(SKIP_SUFFIX) or rel == ".env" or rel == "scripts/polar_webhook_secret.txt":
        continue
    try:
        blob = open(full, "rb").read()
    except OSError:
        continue
    if is_binary(blob):
        continue
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError:
        continue
    for name, rx, repl in PATTERNS:
        for m in rx.finditer(text):
            if "REDACTED_FOR_EXPORT" in m.group(0):
                continue  # our own redaction placeholder
            key = f"{name}:{rel}"
            if key not in counts:
                counts[key] = 0
                synthetic = m.group(0).startswith(("sbp_0123456789", "ghs_"))
                redact_note = "KEEP(test-fixture)" if (is_test(rel) and name in ("gh_install", "supabase_pat") and synthetic) else ("REDACT" if repl else "REVIEW")
                print(f"{redact_note:18} {name:14} {rel}  starts={m.group(0)[:6]}…  len={len(m.group(0))}")
            counts[key] += 1

total = sum(counts.values())
print(f"\n{len(counts)} file-pattern hits, {total} occurrences")
