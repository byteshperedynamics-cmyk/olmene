#!/usr/bin/env python3
"""Comprehensive attempt to recover the dropped char in the Cloudflare token.

Tries many checksum algorithms x input variants x insertion positions.
Also tests the "simply truncated" hypothesis (body intact, 7 of 8 checksum chars).
"""
import hashlib
import zlib

PREFIX = "cfat_"
PAYLOAD = "8xxu0uFyv9Zgadqd4MiHnTv8Wdr2DwQ30KS5wwyf9b584f3"  # 47 chars
ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

# ---------- hash functions returning 8 lowercase hex chars ----------
def _crc32c(data: bytes) -> int:
    poly = 0x82F63B78
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (poly if crc & 1 else 0)
    return crc ^ 0xFFFFFFFF

def fnv1a32(data: bytes) -> int:
    h = 0x811C9DC5
    for b in data:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def djb2(data: bytes) -> int:
    h = 5381
    for b in data:
        h = ((h * 33) + b) & 0xFFFFFFFF
    return h

def sdbm(data: bytes) -> int:
    h = 0
    for b in data:
        h = (b + (h << 6) + (h << 16) - h) & 0xFFFFFFFF
    return h

def jenkins_one_at_a_time(data: bytes) -> int:
    h = 0
    for b in data:
        h = (h + b) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF
    h ^= h >> 11
    h = (h + (h << 15)) & 0xFFFFFFFF
    return h

HASHES = {
    "crc32": lambda s: f"{zlib.crc32(s.encode()) & 0xffffffff:08x}",
    "crc32c": lambda s: f"{_crc32c(s.encode()):08x}",
    "adler32": lambda s: f"{zlib.adler32(s.encode()) & 0xffffffff:08x}",
    "fnv1a32": lambda s: f"{fnv1a32(s.encode()):08x}",
    "djb2": lambda s: f"{djb2(s.encode()):08x}",
    "sdbm": lambda s: f"{sdbm(s.encode()):08x}",
    "joaat": lambda s: f"{jenkins_one_at_a_time(s.encode()):08x}",
    "md5_first8": lambda s: hashlib.md5(s.encode()).hexdigest()[:8],
    "md5_last8": lambda s: hashlib.md5(s.encode()).hexdigest()[-8:],
    "sha1_first8": lambda s: hashlib.sha1(s.encode()).hexdigest()[:8],
    "sha1_last8": lambda s: hashlib.sha1(s.encode()).hexdigest()[-8:],
    "sha256_first8": lambda s: hashlib.sha256(s.encode()).hexdigest()[:8],
    "sha256_last8": lambda s: hashlib.sha256(s.encode()).hexdigest()[-8:],
}

def inputs(body: str):
    return {
        "body": body,
        "prefixed": PREFIX + body,
        "nounderscore": "cfat" + body,
    }

found = []

# ---------- Hypothesis B: token simply truncated (body intact) ----------
body = PAYLOAD[:40]
partial = PAYLOAD[40:]
assert len(partial) == 7
for in_name, istr in inputs(body).items():
    for h_name, fn in HASHES.items():
        val = fn(istr)
        if val.startswith(partial):
            found.append(("TRUNCATED", h_name, in_name, PREFIX + body + val))
        # also check partial anywhere-adjacent: exact 8th char unknown
print(f"Hypothesis B (truncated): {len(found)} match(es)")
for f in found:
    print("  ", f)

# ---------- Hypothesis A: one char dropped anywhere ----------
count = 0
for pos in range(48):
    for c in ALNUM:
        full = PAYLOAD[:pos] + c + PAYLOAD[pos:]
        body, checksum = full[:40], full[40:]
        for in_name, istr in inputs(body).items():
            for h_name, fn in HASHES.items():
                count += 1
                if fn(istr) == checksum:
                    found.append(("DROPPED", h_name, in_name, PREFIX + full, pos, c))
                    print(f"  MATCH: {h_name} / {in_name} -> insert '{c}' at {pos}: {PREFIX}{full}")
print(f"Hypothesis A (dropped char): tested {count} combinations, {len([f for f in found if f[0]=='DROPPED'])} match(es)")

# ---------- Hypothesis C: one char CORRUPTED (not dropped), 47 is true length ----------
# Then maybe format is 40+7? Or body 39 + checksum 8? Try: replace one char to make a
# 47-char token self-consistent under body=first39/checksum=last8, or body=40/checksum=last7.
for pos in range(47):
    orig = PAYLOAD[pos]
    for c in ALNUM:
        if c == orig:
            continue
        full = PAYLOAD[:pos] + c + PAYLOAD[pos + 1:]
        # C1: body=39, checksum=8
        for split, body_len, cs_len in (("39+8", 39, 8), ("40+7", 40, 7)):
            body, checksum = full[:body_len], full[body_len:]
            for in_name, istr in inputs(body).items():
                for h_name, fn in HASHES.items():
                    if cs_len == 8 and fn(istr) == checksum:
                        found.append(("CORRUPTED", h_name, in_name, split, PREFIX + full, pos, c))
                        print(f"  MATCH: {h_name}/{in_name}/{split} -> replace pos {pos} '{orig}'->'{c}': {PREFIX}{full}")
                    if cs_len == 7 and fn(istr).startswith(checksum):
                        found.append(("CORRUPTED7", h_name, in_name, split, PREFIX + full, pos, c))
                        print(f"  MATCH7: {h_name}/{in_name}/{split} -> replace pos {pos} '{orig}'->'{c}': {PREFIX}{full}")

print(f"\nTotal matches: {len(found)}")
if not found:
    print("No standard-hash checksum match found in any hypothesis.")
