#!/usr/bin/env python3
"""Mega forensic recovery for the cfat_ token.

Model: true payload T = 48 chars (40 body + 8 cs). User payload U = 47 chars.
Offline-test all single-error and drop+typo scenarios against a hash zoo.
Any self-consistent candidate -> verify via API.

Cases:
  A) drop at d<=39 (body region): body_c = (U[:d]+c+U[d:])[:40], cs = U[39:47]
  B) drop at d>=40 (cs region): body = U[:40], cs = insert(c into U[40:47] at d-40)
     [covered by v3 API test for zoo hashes -> skip offline, already ruled out]
  C) typo-only, 40+7 format: body typo or cs typo, hamming<=1 on cs7
  D) drop+typo anywhere with crc32/crc32c (deep search)
"""
import hashlib
import json
import subprocess
import sys
import zlib

ACC = "7948c058a723edf20967b364676c9fdc"
PREFIX = "cfat_"
U = "8xxu0uFyv9Zgadqd4MiHnTv8Wdr2DwQ30KS5wwyf9b584f3"
ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BODY = U[:40]
CS7 = U[40:]

def _crc32c(data: bytes) -> int:
    poly = 0x82F63B78
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (poly if crc & 1 else 0)
    return crc ^ 0xFFFFFFFF

def _crc32_variant(data, poly, init, xorout, refin, refout):
    def reflect(x, n):
        r = 0
        for i in range(n):
            if x & (1 << i):
                r |= 1 << (n - 1 - i)
        return r
    crc = init
    for b in data:
        if refin: b = reflect(b, 8)
        crc ^= b << 24
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
    if refout: crc = reflect(crc, 32)
    return crc ^ xorout

IEEEP, C8P, CKP, CQP = 0x04C11DB7, 0x1EDC6F41, 0x741B8CD7, 0x814141AB

def _fnv1a32(d):
    h = 0x811C9DC5
    for b in d:
        h ^= b; h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def _fnv1_32(d):
    h = 0x811C9DC5
    for b in d:
        h = (h * 0x01000193) & 0xFFFFFFFF; h ^= b
    return h

def _fnv1a64(d):
    h = 0xCBF29CE484222325
    for b in d:
        h ^= b; h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h

def _djb2(d):
    h = 5381
    for b in d:
        h = ((h * 33) + b) & 0xFFFFFFFF
    return h

def _sdbm(d):
    h = 0
    for b in d:
        h = (b + (h << 6) + (h << 16) - h) & 0xFFFFFFFF
    return h

def _joaat(d):
    h = 0
    for b in d:
        h = (h + b) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF; h ^= h >> 11; h = (h + (h << 15)) & 0xFFFFFFFF
    return h

def make_hash(name):
    def f(s):
        b = s.encode()
        if name == "crc32": return f"{zlib.crc32(b) & 0xffffffff:08x}"
        if name == "crc32c": return f"{_crc32c(b):08x}"
        if name == "crc32_bzip2": return f"{_crc32_variant(b, IEEEP, 0xFFFFFFFF, 0, False, False):08x}"
        if name == "crc32_jamcrc": return f"{(~zlib.crc32(b)) & 0xffffffff:08x}"
        if name == "crc32_posix": return f"{_crc32_variant(b, IEEEP, 0, 0xFFFFFFFF, False, False):08x}"
        if name == "crc32_xfer": return f"{_crc32_variant(b, 0x000000AF, 0, 0, False, False):08x}"
        if name == "crc32k": return f"{_crc32_variant(b, CKP, 0xFFFFFFFF, 0xFFFFFFFF, True, True):08x}"
        if name == "crc32q": return f"{_crc32_variant(b, CQP, 0, 0, False, False):08x}"
        if name == "adler32": return f"{zlib.adler32(b) & 0xffffffff:08x}"
        if name == "fnv1a32": return f"{_fnv1a32(b):08x}"
        if name == "fnv1_32": return f"{_fnv1_32(b):08x}"
        if name == "fnv1a64": return f"{_fnv1a64(b) & 0xffffffff:08x}"
        if name == "fnv1a64_hi": return f"{_fnv1a64(b) >> 32:08x}"
        if name == "djb2": return f"{_djb2(b):08x}"
        if name == "sdbm": return f"{_sdbm(b):08x}"
        if name == "joaat": return f"{_joaat(b):08x}"
        if name.startswith(("md5", "sha1", "sha256", "sha512", "sha3_256", "blake2s", "blake2b")):
            algo = name.rsplit("_", 1)[0]
            h = hashlib.new(algo, b).hexdigest()
            return h[:8] if name.endswith("first8") else h[-8:]
        raise ValueError(name)
    return f

HASH_NAMES = [
    "crc32", "crc32c", "crc32_bzip2", "crc32_jamcrc", "crc32_posix", "crc32_xfer",
    "crc32k", "crc32q", "adler32", "fnv1a32", "fnv1_32", "fnv1a64", "fnv1a64_hi",
    "djb2", "sdbm", "joaat",
    "md5_first8", "md5_last8", "sha1_first8", "sha1_last8",
    "sha256_first8", "sha256_last8", "sha512_first8", "sha512_last8",
    "sha3_256_first8", "sha3_256_last8", "blake2s_first8", "blake2s_last8",
    "blake2b_first8", "blake2b_last8",
]
INPUT_VARIANTS = {
    "body": lambda b: b,
    "prefixed": lambda b: PREFIX + b,
    "nounderscore": lambda b: "cfat" + b,
    "upper": lambda b: b.upper(),
    "lower": lambda b: b.lower(),
}

candidates = set()  # full 48-char payloads that are self-consistent

def note(payload48, why):
    candidates.add(payload48)
    print(f"  CANDIDATE [{why}]: {PREFIX}{payload48}")

# ---------- Case A: drop in body (d <= 39) ----------
print("Case A: drop in body region, cs = U[39:47] =", U[39:47])
CS_A = U[39:47]
for hn in HASH_NAMES:
    fn = make_hash(hn)
    for ivn, iv in INPUT_VARIANTS.items():
        for d in range(40):
            for c in ALNUM:
                body_c = (U[:d] + c + U[d:])[:40]
                if fn(iv(body_c)) == CS_A:
                    note(U[:d] + c + U[d:], f"A/{hn}/{ivn}/d={d}/c={c}")

# ---------- Case C: typo-only, 40+7 ----------
print("Case C: typo-only 40+7 format")
for hn in HASH_NAMES:
    fn = make_hash(hn)
    for ivn, iv in INPUT_VARIANTS.items():
        h_full = fn(iv(BODY))
        h7 = h_full[:7]
        # C1: typo in body -> body' = U[:40] with one replace; cs7 = U[40:] correct
        #     check each body variant's hash startswith CS7
        if h7 == CS7:
            note(BODY + h_full, f"C-csexact/{hn}/{ivn}")
        # C2: typo in cs (body correct): hamming distance 1 between h7 and CS7
        diff = sum(1 for a, b in zip(h7, CS7) if a != b)
        if diff == 1:
            note(BODY + h_full, f"C-cstypo/{hn}/{ivn}")
        # C3: typo in body: replace one body char, hash startswith CS7
        for p in range(40):
            orig = U[p]
            for c in ALNUM:
                if c == orig:
                    continue
                body_p = U[:p] + c + U[p + 1:]
                if fn(iv(body_p))[:7] == CS7:
                    note(body_p + fn(iv(body_p)), f"C-bodytypo/{hn}/{ivn}/p={p}")

print(f"\nOffline candidates so far: {len(candidates)}")

# ---------- Case D: drop + typo (deep, crc32 + crc32c only) ----------
print("Case D: deep drop+typo search (crc32, crc32c)...")
crc32 = zlib.crc32
crc32c_impl = _crc32c
found_d = 0
for d in range(48):
    # insert c at d
    for c in ALNUM:
        inter = U[:d] + c + U[d:]
        # body of intermediate
        body_i = inter[:40].encode()
        # replacement positions r != d; if r >= 40 body unchanged -> already Case-A-like? No:
        # if r >= 40, body = inter[:40], cs = inter[40:] with one replace -> check directly
        # fast path: precompute crc for body with each possible replace in body region
        for r in range(48):
            if r == d:
                continue
            orig = inter[r]
            if r < 40:
                # body changes
                pre = inter[:r]
                post = inter[r + 1:40]
                cs = inter[40:]
                for e in ALNUM:
                    if e == orig:
                        continue
                    body = pre + e + post
                    bodyb = body.encode()
                    if (f"{crc32(bodyb) & 0xffffffff:08x}" == cs
                            or f"{crc32c_impl(bodyb):08x}" == cs):
                        full = inter[:r] + e + inter[r + 1:]
                        note(full, f"D/d={d},c={c},r={r},e={e}")
                        found_d += 1
            else:
                # cs region: body fixed
                cs_pre = inter[40:r]
                cs_post = inter[r + 1:]
                for e in ALNUM:
                    if e == orig:
                        continue
                    cs = cs_pre + e + cs_post
                    if (f"{crc32(body_i) & 0xffffffff:08x}" == cs
                            or f"{crc32c_impl(body_i):08x}" == cs):
                        full = inter[:r] + e + inter[r + 1:]
                        note(full, f"D-cstypo/d={d},c={c},r={r},e={e}")
                        found_d += 1

print(f"\nTotal offline candidates: {len(candidates)}")

# ---------- API verification ----------
def check(token):
    out = subprocess.run(
        ["curl", "-s", "-m", "20", "-H", f"Authorization: Bearer {token}",
         f"https://api.cloudflare.com/client/v4/accounts/{ACC}"],
        capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out[:150]}

if candidates:
    print("\n=== API verification ===")
    valid = []
    for p in candidates:
        t = PREFIX + p
        r = check(t)
        status = "VALID!!!" if r.get("success") else f"code={r.get('errors',[{}])[0].get('code')}"
        print(f"  {t} -> {status}")
        if r.get("success"):
            valid.append(t)
    print("\nVALID TOKENS:", valid if valid else "none")
else:
    print("No candidates found.")
