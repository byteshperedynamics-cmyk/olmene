#!/usr/bin/env python3
"""Find the EXACT petal midline angle + verify 5-fold symmetry phase."""
import numpy as np
from PIL import Image

SRC = "/home/z/my-project/public/img/logo-mark.png"
mask = np.array(Image.open(SRC).convert("RGBA"))[:, :, 3] > 40
ys, xs = np.nonzero(mask)
cx, cy = xs.mean(), ys.mean()
H, W = mask.shape
yy, xx = np.mgrid[0:H, 0:W]
ang = np.arctan2(yy - cy, xx - cx)
rad = np.hypot(xx - cx, yy - cy)

# Mass-weighted angle histogram in the tip zone (r 140-235) with 0.25 deg bins
zone = mask & (rad > 140)
a = ang[zone]
nbins = 1440
hist, edges = np.histogram(a, bins=nbins, range=(-np.pi, np.pi))
# find peaks: smooth then argmax per 72-deg window
k = 9
hist_s = np.convolve(hist, np.ones(k) / k, mode="same")
centers = (edges[:-1] + edges[1:]) / 2

# global peak
i0 = int(np.argmax(hist_s))
peaks = [centers[i0]]
for m in range(1, 5):
    for delta in range(1, 5):
        pass
# find all 5 peaks: iterate — find max, mask out +-20 deg, repeat
h = hist_s.copy()
found = []
for _ in range(5):
    i = int(np.argmax(h))
    found.append(np.degrees(centers[i]))
    # mask neighbors within 20 deg
    d = np.abs((centers - centers[i] + np.pi) % (2 * np.pi) - np.pi)
    h[d < np.radians(25)] = 0
found.sort()
print("5 peak angles (deg):", [f"{x:.2f}" for x in found])
diffs = [(found[(i + 1) % 5] - found[i]) % 360 for i in range(5)]
print("spacings:", [f"{d:.2f}" for d in diffs])
mean_spacing = sum(diffs) / 5
print(f"mean spacing: {mean_spacing:.3f} (ideal 72)")
# symmetry phase: mean of peaks mod 72
phase = sum((p % 72) for p in found) / 5
print(f"phase mod 72: {phase:.2f}")

# Better: symmetry-optimal midline = circular mean of peak angles mod 72
angles_mod = np.radians([p % 72 for p in found])
mc = np.cos(angles_mod).mean(); ms = np.sin(angles_mod).mean()
phase_circ = np.degrees(np.arctan2(ms, mc)) % 72
print(f"circular-mean phase mod 72: {phase_circ:.2f}")

# The UP petal midline = phase + 72k nearest to -90 (i.e., 270)
cands = [phase_circ + 72 * k for k in range(-3, 4)]
up = min(cands, key=lambda t: abs(((t - 270 + 180) % 360) - 180))
print(f"=> UP petal midline: {up:.2f} deg")
