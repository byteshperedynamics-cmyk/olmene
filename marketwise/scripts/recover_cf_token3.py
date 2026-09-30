#!/usr/bin/env python3
"""Test API-oracle approach: assume body (first 40 chars) is correct and only
the checksum region was garbled. Compute checksum with each candidate algorithm,
build candidate tokens, test each against the Cloudflare API."""
import hashlib
import json
import subprocess
import zlib

ACC = "7948c058a723edf20967b364676c9fdc"
BODY = "8xxu0uFyv9Zgadqd4MiHnTv8Wdr2DwQ30KS5wwyf"  # 40 chars as typed by user
PREFIX = "cfat_"

def _crc32c(data: bytes) -> int:
    poly = 0x82F63B78
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (poly if crc & 1 else 0)
    return crc ^ 0xFFFFFFFF

def _crc32_variant(data: bytes, poly: int, init: int, xorout: int, refin: bool, refout: bool) -> int:
    def reflect(x, n):
        r = 0
        for i in range(n):
            if x & (1 << i):
                r |= 1 << (n - 1 - i)
        return r
    crc = init
    for b in data:
        if refin:
            b = reflect(b, 8)
        crc ^= b << 24
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
    if refout:
        crc = reflect(crc, 32)
    return crc ^ xorout

CRC32_IEEE = 0x04C11DB7
CRC32C = 0x1EDC6F41
CRC32K = 0x741B8CD7
CRC32Q = 0x814141AB

def fnv1a32(data: bytes) -> int:
    h = 0x811C9DC5
    for b in data:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def fnv1_32(data: bytes) -> int:
    h = 0x811C9DC5
    for b in data:
        h = (h * 0x01000193) & 0xFFFFFFFF
        h ^= b
    return h

def fnv1a64(data: bytes) -> int:
    h = 0xCBF29CE484222325
    for b in data:
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
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

def joaat(data: bytes) -> int:
    h = 0
    for b in data:
        h = (h + b) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF
    h ^= h >> 11
    h = (h + (h << 15)) & 0xFFFFFFFF
    return h

def xxh32(data: bytes) -> int:
    P1, P2, P3, P4, P5 = 2654435761, 2246822519, 3266489917, 668265263, 374761393
    M = 0xFFFFFFFF
    def rotl(x, r): return ((x << r) | (x >> (32 - r))) & M
    n = len(data)
    i = 0
    if n >= 16:
        v1, v2, v3, v4 = (P1 + P2) & M, P2 & M, 0, (0 - P1) & M
        def round_(acc, buf):
            lane = int.from_bytes(buf, "little")
            acc = (acc + lane * P2) & M
            acc = rotl(acc, 13)
            acc = (acc * P1) & M
            return acc
        while i + 16 <= n:
            v1 = round_(v1, data[i:i+4]); v2 = round_(v2, data[i+4:i+8])
            v3 = round_(v3, data[i+8:i+12]); v4 = round_(v4, data[i+12:i+16])
            i += 16
        h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & M
    else:
        h = P5 & M
    h = (h + n) & M
    while i + 4 <= n:
        lane = int.from_bytes(data[i:i+4], "little")
        h = (h + lane * P3) & M
        h = rotl(h, 17)
        h = (h * P4) & M
        i += 4
    while i < n:
        h = (h + data[i] * P5) & M
        h = rotl(h, 11)
        h = (h * P1) & M
        i += 1
    h ^= h >> 15
    h = (h * P2) & M
    h ^= h >> 13
    h = (h * P3) & M
    h ^= h >> 16
    return h

def make_hash(name):
    def f(s: str) -> str:
        b = s.encode()
        if name == "crc32": return f"{zlib.crc32(b) & 0xffffffff:08x}"
        if name == "crc32c": return f"{_crc32c(b):08x}"
        if name == "crc32_bzip2": return f"{_crc32_variant(b, CRC32_IEEE, 0xFFFFFFFF, 0, False, False):08x}"
        if name == "crc32_mpeg2": return f"{_crc32_variant(b, CRC32_IEEE, 0xFFFFFFFF, 0, False, False):08x}"
        if name == "crc32_jamcrc": return f"{(~zlib.crc32(b)) & 0xffffffff:08x}"
        if name == "crc32_posix": return f"{_crc32_variant(b, CRC32_IEEE, 0, 0xFFFFFFFF, False, False):08x}"
        if name == "crc32_xfer": return f"{_crc32_variant(b, 0x000000AF, 0, 0, False, False):08x}"
        if name == "crc32k": return f"{_crc32_variant(b, CRC32K, 0xFFFFFFFF, 0xFFFFFFFF, True, True):08x}"
        if name == "crc32q": return f"{_crc32_variant(b, CRC32Q, 0, 0, False, False):08x}"
        if name == "adler32": return f"{zlib.adler32(b) & 0xffffffff:08x}"
        if name == "fnv1a32": return f"{fnv1a32(b):08x}"
        if name == "fnv1_32": return f"{fnv1_32(b):08x}"
        if name == "fnv1a64": return f"{fnv1a64(b) & 0xffffffff:08x}"
        if name == "fnv1a64_hi": return f"{fnv1a64(b) >> 32:08x}"
        if name == "djb2": return f"{djb2(b):08x}"
        if name == "sdbm": return f"{sdbm(b):08x}"
        if name == "joaat": return f"{joaat(b):08x}"
        if name == "xxh32": return f"{xxh32(b):08x}"
        if name.startswith(("md5", "sha1", "sha256", "sha512", "sha3_256", "blake2s")):
            algo = name.rsplit("_", 1)[0]
            h = hashlib.new(algo, b).hexdigest()
            return h[:8] if name.endswith("first8") else h[-8:]
        raise ValueError(name)
    return f

HASH_NAMES = [
    "crc32", "crc32c", "crc32_bzip2", "crc32_mpeg2", "crc32_jamcrc", "crc32_posix",
    "crc32_xfer", "crc32k", "crc32q", "adler32", "fnv1a32", "fnv1_32", "fnv1a64",
    "fnv1a64_hi", "djb2", "sdbm", "joaat", "xxh32",
    "md5_first8", "md5_last8", "sha1_first8", "sha1_last8",
    "sha256_first8", "sha256_last8", "sha512_first8", "sha512_last8",
    "sha3_256_first8", "sha3_256_last8", "blake2s_first8", "blake2s_last8",
]

INPUT_VARIANTS = {
    "body": lambda b: b,
    "prefixed": lambda b: PREFIX + b,
    "nounderscore": lambda b: "cfat" + b,
    "upper": lambda b: b.upper(),
    "lower": lambda b: b.lower(),
}

def check_token(token: str) -> dict:
    cmd = [
        "curl", "-s", "-m", "20",
        "-H", f"Authorization: Bearer {token}",
        f"https://api.cloudflare.com/client/v4/accounts/{ACC}",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out[:200]}

print("=== CONTROL: garbage token ===")
r = check_token("cfat_" + "A" * 47)
print(json.dumps(r.get("errors", r))[:200])

print("\n=== CANDIDATES (body as typed + computed checksum) ===")
tested = set()
interesting = []
for hn in HASH_NAMES:
    fn = make_hash(hn)
    for iv_name, iv in INPUT_VARIANTS.items():
        cs = fn(iv(BODY))
        token = PREFIX + BODY + cs
        if token in tested:
            continue
        tested.add(token)
        r = check_token(token)
        errs = r.get("errors", [])
        code = errs[0].get("code") if errs else None
        ok = r.get("success")
        if ok or code != 9109:
            print(f"[{hn}/{iv_name}] {token}")
            print(f"    -> {json.dumps(r)[:300]}")
            if ok:
                interesting.append((hn, iv_name, token))
                print("    <<< VALID TOKEN FOUND!")
        else:
            print(f"[{hn}/{iv_name}] -> 9109")

print(f"\nDone. {len(tested)} candidates tested, {len(interesting)} valid.")
for hn, iv, t in interesting:
    print(f"VALID: [{hn}/{iv}] {t}")
