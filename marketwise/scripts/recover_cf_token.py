#!/usr/bin/env python3
"""Recover a dropped character from a Cloudflare scannable token (cfat_...).

Format (per @secretlint/secretlint-rule-cloudflare):
    {prefix}_{40 chars body}{8 chars checksum}
    checksum = CRC32(body) as 8 lowercase hex chars

The user-transcribed token is 1 char short (47 instead of 48 after prefix).
Brute-force: insert each alnum char at each position; check CRC32 match.
"""
import itertools
import zlib

PREFIX = "cfat_"
PAYLOAD = "8xxu0uFyv9Zgadqd4MiHnTv8Wdr2DwQ30KS5wwyf9b584f3"  # 47 chars
assert len(PAYLOAD) == 47, len(PAYLOAD)

ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

def crc32_hex(s: str) -> str:
    return f"{zlib.crc32(s.encode()) & 0xffffffff:08x}"

matches = []

# Variant checksum inputs
def checksum_candidates(body: str):
    return {
        "crc32(body)": crc32_hex(body),
        "crc32(prefix+body)": crc32_hex(PREFIX + body),
        "crc32(prefix_nounderscore+body)": crc32_hex("cfat" + body),
    }

# Case A: a char was dropped from the body or boundary — brute force insertion
for pos in range(len(PAYLOAD) + 1):
    for c in ALNUM:
        full = PAYLOAD[:pos] + c + PAYLOAD[pos:]
        body, checksum = full[:40], full[40:]
        for variant, expected in checksum_candidates(body).items():
            if checksum == expected:
                matches.append((variant, PREFIX + full, pos, c))

print(f"Insertion brute force: {len(matches)} match(es)")
for variant, token, pos, c in matches:
    print(f"  [{variant}] insert '{c}' at payload pos {pos} -> {token}")

# Case B: last char of checksum simply omitted (body intact, checksum=first 7 of 8)
body = PAYLOAD[:40]
partial = PAYLOAD[40:]
for variant, expected in checksum_candidates(body).items():
    if expected.startswith(partial):
        print(f"  [Case B / {variant}] full checksum={expected} -> token: {PREFIX}{body}{expected}")

if not matches:
    print("No insertion match found — trying crc32c variant")
    try:
        import crcmod  # noqa
    except ImportError:
        print("crcmod not available; skipping crc32c")
