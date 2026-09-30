#!/usr/bin/env python3
"""Redact live secret patterns in the GitHub export copy.
Replacements are clearly marked placeholders. Test fixtures (__tests__/fixtures.ts)
are skipped — they are synthetic by design.
Usage: python3 scripts/gh_export_redact.py <export-dir>"""
import os, re, sys

EXPORT = sys.argv[1]

PATTERNS = [
    (re.compile(r"\bsbp_[a-f0-9]{16,}"),                        "sbp_REDACTED_FOR_EXPORT"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),               "github_pat_REDACTED_FOR_EXPORT"),
    (re.compile(r"\bghs_[A-Za-z0-9_]{20,}"),                    "ghs_REDACTED_FOR_EXPORT"),
    (re.compile(r"\bwhsec_[A-Za-z0-9+/=]{16,}"),                "whsec_REDACTED_FOR_EXPORT"),
    (re.compile(r"cfat_[A-Za-z0-9]{20,}"),                      "cfat_REDACTED_FOR_EXPORT"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{40,}\.[A-Za-z0-9_\-]{40,}\.[A-Za-z0-9_\-]{20,}"), "REDACTED_JWT_FOR_EXPORT"),
]

def is_test(p):
    return "__tests__" in p or p.endswith("fixtures.ts")

def is_binary(b):
    return b"\x00" in b[:4096]

changed = {}
for dp, _, names in os.walk(EXPORT):
    if "/.git" in dp:
        continue
    for n in names:
        full = os.path.join(dp, n)
        rel = os.path.relpath(full, EXPORT)
        if is_binary(open(full, "rb").read(4096)):
            continue
        try:
            text = open(full, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        new = text
        if not is_test(rel):
            for rx, repl in PATTERNS:
                new = rx.sub(repl, new)
        if new != text:
            open(full, "w", encoding="utf-8").write(new)
            n_hits = sum(len(rx.findall(text)) for rx, _ in PATTERNS)
            changed[rel] = n_hits

for rel, n in sorted(changed.items()):
    print(f"  redacted {n:2}x  {rel}")
print(f"{len(changed)} files redacted")
