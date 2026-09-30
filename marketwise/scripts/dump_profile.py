#!/usr/bin/env python3
"""Dump the RAW ray profile at fine resolution to find the true petal edge taper."""
import numpy as np
from PIL import Image
import math

SRC = "/home/z/my-project/public/img/logo-mark.png"
img = Image.open(SRC).convert("RGBA")
a = np.array(img)[:, :, 3]
mask = a > 40
ys, xs = np.nonzero(mask)
cx, cy = xs.mean(), ys.mean()
H, W = mask.shape

def ray_radius(theta_deg):
    t = math.radians(theta_deg)
    best = 0.0
    r = 0.0
    while r <= 260:
        x = int(round(cx + r * math.cos(t)))
        y = int(round(cy + r * math.sin(t)))
        if 0 <= x < W and 0 <= y < H and mask[y, x]:
            best = r
        r += 0.5
    return best

print("RAW profile, fine steps near edges (offset from midline -90):")
print("offset_deg  raw_r")
for off in [36.0, 35.5, 35.0, 34.5, 34.0, 33.5, 33.0, 32.0, 31.0, 30.0, 29.0, 28.0, 26.0, 24.0, 20.0, 15.0, 10.0, 5.0, 0.0]:
    print(f"  {off:5.1f}  {ray_radius(-90 + off):6.1f}   |  {-off:5.1f}  {ray_radius(-90 - off):6.1f}")

# Also: where does petal edge cross r=40? scan offsets for first r>=40
print("\nedge angle by radius (first offset where raw_r >= R):")
for R in [30, 60, 90, 120, 150, 180, 210]:
    for off in [x * 0.5 for x in range(0, 73)]:
        if ray_radius(-90 + off) >= R:
            print(f"  r>={R:3d} at offset {off:5.1f} deg")
            break
    else:
        print(f"  r>={R:3d} never")
