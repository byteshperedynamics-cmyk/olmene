#!/usr/bin/env python3
"""Debug the flower trace: dump masks and geometry info."""
import numpy as np
from PIL import Image
import math
from scipy import ndimage as ndi

SRC = "/home/z/my-project/public/img/logo-mark.png"
img = Image.open(SRC).convert("RGBA")
a = np.array(img)[:, :, 3]
mask = a > 40

ys, xs = np.nonzero(mask)
cx, cy = xs.mean(), ys.mean()
print(f"image {mask.shape}, mask bbox x[{xs.min()},{xs.max()}] y[{ys.min()},{ys.max()}]")
print(f"centroid ({cx:.1f},{cy:.1f})")

# Radial extent
r = np.hypot(xs - cx, ys - cy)
print(f"radius: max={r.max():.0f} p99={np.percentile(r,99):.0f} p95={np.percentile(r,95):.0f}")

# Angular profile at several radii — where are the petals?
H, W = mask.shape
yy, xx = np.mgrid[0:H, 0:W]
ang = np.arctan2(yy - cy, xx - cx)
rad = np.hypot(xx - cx, yy - cy)

for rtest in [40, 70, 100, 125]:
    band = (rad > rtest - 4) & (rad < rtest + 4) & mask
    if band.sum() == 0:
        print(f"r={rtest}: no mass")
        continue
    bang = np.degrees(np.arctan2((yy - cy)[band], (xx - cx)[band]))
    # Angular coverage: fraction of 360 covered
    hist, _ = np.histogram(bang, bins=72, range=(-180, 180))
    covered = (hist > 3).sum() / 72 * 360
    # Find contiguous angular runs (petals)
    runs = []
    in_run = False
    for i, h in enumerate(np.concatenate([hist, hist[:1]])):
        if h > 3 and not in_run:
            start = i; in_run = True
        elif h <= 3 and in_run:
            runs.append(((i - start) * 5, start * 5 - 180))
            in_run = False
    runs.sort(reverse=True)
    print(f"r={rtest}: covered {covered:.0f} deg, top runs (width,start): {runs[:6]}")

# Save sector mask for petal 0 (sector center 124.5, half-width 34)
def in_sector(t, center_deg, half_deg):
    d = (t - math.radians(center_deg) + math.pi) % (2 * math.pi) - math.pi
    return np.abs(d) <= math.radians(half_deg)

for hw in [28, 34, 36]:
    sel = mask & in_sector(ang, math.radians(124.5), hw)
    Image.fromarray((sel * 255).astype(np.uint8)).save(f"/home/z/my-project/shots/debug-sector-hw{hw}.png")
    # radial extent of the sector selection
    if sel.sum():
        rs = rad[sel]
        print(f"hw={hw}: sector mass={sel.sum()}, r max={rs.max():.0f}")

# Also full-mask dump
Image.fromarray((mask * 255).astype(np.uint8)).save("/home/z/my-project/shots/debug-mask.png")
print("saved debug images")
