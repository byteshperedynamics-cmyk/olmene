#!/usr/bin/env python3
"""Extract longest decodable utf-8 run containing a given offset."""
import sys
path, center, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
data = open(path, "rb").read()
best = (center, center)
# step back to find start
s = center
while s > 0:
    step = 200
    try:
        data[s-step:center].decode("utf-8")
        s -= step
    except Exception:
        break
# fine-tune
while s > 0:
    try:
        data[s-1:center].decode("utf-8"); s -= 1
    except Exception:
        break
# extend forward
e = center
while e < len(data):
    try:
        data[s:e+2000].decode("utf-8"); e += 2000
    except Exception:
        break
while e < len(data):
    try:
        data[s:e+1].decode("utf-8"); e += 1
    except Exception:
        break
src = data[s:e].decode("utf-8")
open(out, "w").write(src)
print(f"region {s}..{e} ({e-s} chars) -> {out}")
print("HEAD:", repr(src[:150]))
print("TAIL:", repr(src[-150:]))
