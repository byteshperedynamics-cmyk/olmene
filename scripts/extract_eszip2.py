#!/usr/bin/env python3
"""Parse ESZIP 2.3 directory: vfs://N entries -> (u32 offset, u32 length) of module sources."""
import re, sys, os

path, outdir = sys.argv[1], sys.argv[2]
data = open(path, "rb").read()
os.makedirs(outdir, exist_ok=True)

# Directory region is near the start; scan first 64KB for vfs:// markers
dir_end = data.find(b"---SUPABASE-ESZIP-VERSION-ESZIP---") + 100
region = data[:dir_end + 200000]
entries = []
for m in re.finditer(rb"vfs://(\d+)", region[:400000]):
    p = m.end()
    off = int.from_bytes(data[p:p+4], "big")
    ln = int.from_bytes(data[p+4:p+8], "big")
    if 0 < off < len(data) and 0 < ln < 5_000_000 and off + ln <= len(data):
        entries.append((m.group(1).decode(), off, ln))

print(f"parsed {len(entries)} vfs entries")
for name, off, ln in entries:
    blob = data[off:off+ln]
    # try detect what it is
    head = blob[:60]
    kind = "bin"
    try:
        t = blob.decode("utf-8")
        kind = "text"
    except Exception:
        pass
    fn = os.path.join(outdir, f"{name}_{off}.{ 'ts' if kind=='text' else 'bin'}")
    with open(fn, "wb") as f:
        f.write(blob)
    print(f"{name:5s} off={off:9d} len={ln:8d} {kind} head={head[:48]!r}")
