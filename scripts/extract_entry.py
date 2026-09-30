#!/usr/bin/env python3
"""Extract the raw TS entry bundle from an ESZIP: from first '── inlined:' marker (minus ~50) to '});' before '2.0{' npm json."""
import sys, re
path, out = sys.argv[1], sys.argv[2]
data = open(path, "rb").read()
m = re.search(rb"inlined: _shared/cors", data)
assert m, "no inlined marker"
start = m.start() - 60
# find end: '});' followed by '2.0{' + package json of npm
em = re.search(rb"\}\);\n2\.0\{\n\s+\"name\":", data[start:])
if em:
    end = start + em.end() - len("2.0{\n") - em.group().index("2.0{") if False else start + em.start() + 3
else:
    # fallback: next 200KB text run
    end = start
    while end < start + 300000:
        try:
            data[start:end+1000].decode("utf-8"); end += 1000
        except Exception:
            break
src = data[start:end].decode("utf-8", errors="replace")
open(out, "w").write(src)
print(f"saved {len(src)} chars to {out}")
