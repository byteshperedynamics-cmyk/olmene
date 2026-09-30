#!/usr/bin/env python3
"""Compact the traced petal path: resample + RDP to ~40 pts, verify IoU stays,
emit the final path string for the AnimatedFlower component."""
import numpy as np
from PIL import Image
import math
import re

# load current path from the svg
svg = open("/home/z/my-project/scripts/flower_petals.svg").read()
d = re.search(r'd="([^"]+)"', svg).group(1)

# parse all coordinates from the path (M/L/C commands)
nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
# The path: M x,y L x,y C ... L x,y Z — extract all anchor points: M, L, and C endpoints (every 3rd pair after C)
# Simpler: rebuild from the trace script's data — re-derive outer/inner chains, then simplify both.
# Instead of parsing, re-run the ray logic here quickly:
mask = np.array(Image.open("/home/z/my-project/public/img/logo-mark.png").convert("RGBA"))[:, :, 3] > 40
H, W = mask.shape
CX, CY = 274.400, 255.050
yy, xx = np.mgrid[0:H, 0:W]
rad = np.hypot(xx - CX, yy - CY)
rmax = rad[mask].max()

def ray_segments(theta_deg):
    t = math.radians(theta_deg)
    segs = []
    in_seg = False
    r = 0.0
    step = 0.5
    while r <= rmax + 12:
        x = int(round(CX + r * math.cos(t)))
        y = int(round(CY + r * math.sin(t)))
        on = 0 <= x < W and 0 <= y < H and mask[y, x]
        if on and not in_seg:
            in_seg = True; rs = r
        elif not on and in_seg:
            in_seg = False
            segs.append((rs, r - step))
        r += step
    if in_seg:
        segs.append((rs, r - step))
    return segs

ang = np.degrees(np.arctan2(yy - CY, xx - CX)) % 360
nb = 1440
rprof = np.zeros(nb)
ai = ((ang[mask] % 360) * nb / 360).astype(int) % nb
np.maximum.at(rprof, ai, rad[mask])
def rp(deg):
    return rprof[int(deg * nb / 360) % nb]

TH = 40
left = 270.0
while rp(left - 0.25) > TH:
    left -= 0.25
right = 270.0
while rp(right + 0.25) > TH:
    right += 0.25

thetas = [left - 0.5 + i * 0.5 for i in range(int((right - left + 1) / 0.5) + 1)]
outer, inner = [], []
for t in thetas:
    segs = ray_segments(t % 360)
    if segs:
        outer.append(segs[-1][1]); inner.append(segs[-1][0])
    else:
        outer.append(0.0); inner.append(0.0)

def smooth(v, k=3):
    out = []
    n = len(v)
    for i in range(n):
        l3, h3 = max(0, i - k // 2), min(n, i + k // 2 + 1)
        out.append(sum(v[l3:h3]) / (h3 - l3))
    return out

outer = smooth(outer); inner = smooth(inner)
O = [(r * math.cos(math.radians(t)), r * math.sin(math.radians(t))) for t, r in zip(thetas, outer)]
I_ = [(r * math.cos(math.radians(t)), r * math.sin(math.radians(t))) for t, r in zip(thetas, inner)]

# Force inner endpoints at the run edges to meet outer (close the shape cleanly)
I_[0] = O[0]; I_[-1] = O[-1]

def rdp(points, eps):
    if len(points) < 3:
        return points
    def _pd(p, a, b):
        ax, ay = a; bx, by = b; px, py = p
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        if L == 0:
            return math.hypot(px - ax, py - ay)
        return abs(dx * (ay - py) - (ax - px) * dy) / L
    stack = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        dmax, idx = 0.0, -1
        for i in range(s + 1, e):
            dd = _pd(points[i], points[s], points[e])
            if dd > dmax:
                dmax, idx = dd, i
        if dmax > eps:
            keep[idx] = True
            stack.append((s, idx)); stack.append((idx, e))
    return [p for p, k in zip(points, keep) if k]

for eps in [3.0, 2.0, 1.4]:
    O_s = rdp(O, eps)
    I_s = rdp(I_, eps)
    print(f"eps={eps}: outer {len(O)}->{len(O_s)}, inner {len(I_)}->{len(I_s)}")

eps = 2.0
O_s = rdp(O, eps)
I_s = rdp(I_, eps)

def catmull_chain(P, dec=1):
    P = P[::dec] if dec > 1 else P
    out = ""
    n = len(P)
    for i in range(n - 1):
        p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, n - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        out += f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f} "
    return out

d_new = f"M{O_s[0][0]:.1f} {O_s[0][1]:.1f} "
d_new += catmull_chain(O_s)
d_new += f"L{I_s[-1][0]:.1f} {I_s[-1][1]:.1f} "
d_new += catmull_chain(list(reversed(I_s)))
d_new += "Z"
print(f"\npath length: {len(d_new)} chars")
print(d_new[:200] + " ...")

# verify: render + IoU
import subprocess
vb = 263
lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-vb} {-vb} {2*vb} {2*vb}" width="{2*vb}" height="{2*vb}">']
for k in range(5):
    lines.append(f'  <path d="{d_new}" fill="#000000" transform="rotate({-k*72})"/>')
lines.append("</svg>")
open("/tmp/flower_traced.svg", "w").write("\n".join(lines))
r = subprocess.run(["node", "/home/z/my-project/scripts/render_traced.js"], capture_output=True, text=True)
assert "rendered" in r.stdout, r.stderr
tr = np.array(Image.open("/tmp/flower_traced.png").convert("RGBA"))[:, :, 3] > 40
canvas = np.zeros((512, 512), dtype=bool)
dy, dx = int(round(CY - vb)), int(round(CX - vb))
hh, ww = tr.shape
y0, y1 = max(0, dy), min(512, dy + hh)
x0, x1 = max(0, dx), min(512, dx + ww)
canvas[y0:y1, x0:x1] = tr[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
m1 = mask
inter = (m1 & canvas).sum(); union = (m1 | canvas).sum()
print(f"IoU (compact) = {inter/union:.4f}  ratio={canvas.sum()/m1.sum():.3f}")

with open("/tmp/petal_path.txt", "w") as f:
    f.write(d_new)
print("path saved to /tmp/petal_path.txt")
