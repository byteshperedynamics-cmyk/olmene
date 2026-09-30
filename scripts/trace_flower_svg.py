#!/usr/bin/env python3
"""PINWHEEL trace v2: capture full radial occupancy per ray.

Each ray inside the petal's angular run may pass: neighbor-base mass (small r),
valley gap, then THIS petal's swirled body. The petal's true region per angle
is the contiguous mass segment ENDING at r_out (the last segment).
Outer chain = r_out(theta); inner chain = r_in(theta) (start of last segment).
"""
import numpy as np
from PIL import Image
import math

SRC = "/home/z/my-project/public/img/logo-mark.png"
OUT = "/home/z/my-project/scripts/flower_petals.svg"

mask = np.array(Image.open(SRC).convert("RGBA"))[:, :, 3] > 40
H, W = mask.shape
CX, CY = 274.400, 255.050
yy, xx = np.mgrid[0:H, 0:W]
rad = np.hypot(xx - CX, yy - CY)
rmax = rad[mask].max()

def ray_segments(theta_deg):
    """Contiguous mass segments [(r_start, r_end), ...] along the ray."""
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
print(f"UP run [{left:.2f},{right:.2f}]")

lo, hi = left - 0.5, right + 0.5
thetas = [lo + i * 0.25 for i in range(int((hi - lo) / 0.25) + 1)]

outer, inner = [], []
for t in thetas:
    segs = ray_segments(t % 360)
    if not segs:
        outer.append(0.0); inner.append(0.0)
        continue
    last = segs[-1]  # segment ending at r_out
    outer.append(last[1])
    inner.append(last[0])
# smooth both
def smooth(v):
    out = []
    n = len(v)
    for i in range(n):
        l3, h3 = max(0, i - 2), min(n, i + 3)
        out.append(sum(v[l3:h3]) / (h3 - l3))
    return out
outer_s = smooth(outer)
inner_s = smooth(inner)
print("sample (theta, r_in, r_out):")
for i in range(0, len(thetas), 28):
    print(f"  {thetas[i]:7.2f}  in={inner_s[i]:6.1f}  out={outer_s[i]:6.1f}")

# SVG coords = image coords (both y-down)
O = [(r * math.cos(math.radians(t)), r * math.sin(math.radians(t))) for t, r in zip(thetas, outer_s)]
I_ = [(r * math.cos(math.radians(t)), r * math.sin(math.radians(t))) for t, r in zip(thetas, inner_s)]

def catmull_chain(P):
    out = ""
    n = len(P)
    for i in range(n - 1):
        p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, n - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        out += f"C {c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f} "
    return out

# Path: outer chain left->right, then inner chain right->left, close.
d = f"M {O[0][0]:.2f},{O[0][1]:.2f} "
d += catmull_chain(O)
d += f"L {I_[-1][0]:.2f},{I_[-1][1]:.2f} "
d += catmull_chain(list(reversed(I_)))
d += "Z"

vb = math.ceil(rmax + 6)
lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-vb} {-vb} {2*vb} {2*vb}">']
for k in range(5):
    lines.append(f'  <path class="petal p{k}" d="{d}" fill="currentColor" transform="rotate({k*72})"/>')
lines.append("</svg>")
open(OUT, "w").write("\n".join(lines))
print(f"wrote {OUT}")

import subprocess
svg = open(OUT).read()
svg2 = svg.replace(f'viewBox="{-vb} {-vb} {2*vb} {2*vb}"',
                   f'viewBox="{-vb} {-vb} {2*vb} {2*vb}" width="{2*vb}" height="{2*vb}"')
svg2 = svg2.replace("currentColor", "#000000")
open("/tmp/flower_traced.svg", "w").write(svg2)
r = subprocess.run(["node", "/home/z/my-project/scripts/render_traced.js"], capture_output=True, text=True)
assert "rendered" in r.stdout, r.stderr
m2r = np.array(Image.open("/tmp/flower_traced.png").convert("RGBA"))[:, :, 3] > 40
canvas = np.zeros((512, 512), dtype=bool)
dy, dx = int(round(CY - vb)), int(round(CX - vb))
hh, ww = m2r.shape
y0, y1 = max(0, dy), min(512, dy + hh)
x0, x1 = max(0, dx), min(512, dx + ww)
canvas[y0:y1, x0:x1] = m2r[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
m1 = mask
inter = (m1 & canvas).sum(); union = (m1 | canvas).sum()
print(f"IoU = {inter/union:.4f}   ratio={canvas.sum()/m1.sum():.3f}")
