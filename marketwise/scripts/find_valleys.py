#!/usr/bin/env python3
"""Robust petal geometry: find the 5 VALLEY angles directly (rmax->0),
petal midlines = midpoints between consecutive valleys. Then trace."""
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

# For every 0.25 deg, the max mask radius along that ray (vectorized-ish via lookup)
# Precompute: for each angle bin, max radius of mask pixels in that bin
ang = np.degrees(np.arctan2(yy - CY, xx - CX)) % 360
nb = 1440  # 0.25 deg bins
rprof = np.zeros(nb)
sel = mask
ai = ((ang[sel] % 360) * nb / 360).astype(int) % nb
ri = rad[sel]
np.maximum.at(rprof, ai, ri)

# smooth lightly
k = 3
rprof_s = np.convolve(np.concatenate([rprof[-2:], rprof, rprof[:2]]), np.ones(k) / k, mode="same")[2:-2]

# Valleys: angles where rprof < 15 (petals separated by deep valleys to near center)
low = rprof_s < 15
# find contiguous low runs (with wraparound)
runs = []
i = 0
visited = [False] * nb
for start in range(nb):
    if low[start] and not visited[start]:
        # walk forward
        end = start
        while end < nb and low[end]:
            visited[end] = True
            end += 1
        runs.append((start, end - 1, (end - start)))
runs = [r for r in runs if r[2] >= 4]  # at least 1 deg wide
print("low runs (start_bin, end_bin, width_bins):", runs)
if runs and runs[0][0] == 0 and runs[-1][2] < nb - 1:
    # merge wraparound
    pass

# valley centers in degrees
valleys = []
for s, e, w in runs:
    # handle wrap: if run crosses 360
    mid = ((s + e) / 2) * 360 / nb % 360
    valleys.append(mid)
print("valley centers (deg):", [f"{v:.2f}" for v in valleys])

if len(valleys) != 5:
    print(f"WARNING: found {len(valleys)} valleys, expected 5")
    # fallback: merge/closest spacing adjustments
else:
    valleys.sort()
    midlines = []
    for i in range(5):
        a = valleys[i]; b = valleys[(i + 1) % 5]
        if b < a:
            b += 360
        midlines.append(((a + b) / 2) % 360)
    print("petal midlines:", [f"{m:.2f}" for m in midlines])
    # UP petal = midline closest to 270
    up = min(midlines, key=lambda t: abs(((t - 270 + 180) % 360) - 180))
    print(f"UP petal midline: {up:.2f}")

    # half-widths from midline to each adjacent valley
    i = midlines.index(up)
    left_v = valleys[i - 1 if i > 0 else 4]
    right_v = valleys[(i + 1) % 5]
    hw_l = (up - left_v) % 360
    hw_r = (right_v - up) % 360
    print(f"half-widths: left={hw_l:.2f} right={hw_r:.2f}")
