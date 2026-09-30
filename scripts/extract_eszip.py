#!/usr/bin/env python3
"""Extract source modules from an ESZIP v2.3 file by scanning vfs entries."""
import sys, struct, re

path = sys.argv[1]
out_prefix = sys.argv[2]
data = open(path, "rb").read()

# ESZIP: header "ESZIP2.3" then sections. Modules stored with metadata + source.
# Strategy: find utf8 source blobs between length-prefixed records.
# Simpler robust approach: locate all printable TS/JS source regions and split on vfs paths.
offsets = []
for m in re.finditer(rb"vfs://", data):
    offsets.append((m.start(), data[m.start():m.start()+120]))

print(f"file size: {len(data)}, vfs markers: {len(offsets)}")
for off, preview in offsets[:40]:
    print(off, preview[:100])
