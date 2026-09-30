#!/usr/bin/env python3
"""Objective fidelity check: render traced SVG, compare masks with original via IoU."""
import subprocess
import numpy as np
from PIL import Image

# Render traced SVG at 512 with proper color (replace currentColor -> terracotta)
svg = open("/home/z/my-project/scripts/flower_petals.svg").read()
svg = svg.replace('viewBox="-246 -246 492 492"', 'viewBox="-246 -246 492 492" width="512" height="512"')
svg = svg.replace("currentColor", "#D97757")
open("/tmp/flower_traced.svg", "w").write(svg)

r = subprocess.run(
    ["node", "/home/z/my-project/scripts/render_traced.js"],
    capture_output=True, text=True, cwd="/home/z/my-project")
print(r.stdout, r.stderr)

# Original mask, centered how the trace centered it (centroid-based)
orig = np.array(Image.open("/home/z/my-project/public/img/logo-mark.png").convert("RGBA"))[:, :, 3]
m1 = orig > 40

# Traced render mask
tr = np.array(Image.open("/tmp/flower_traced.png").convert("RGBA"))[:, :, 3]
m2 = tr > 40

# The traced SVG is centered on the ORIGINAL CENTROID coords (cx=254.9, cy=267.3)
# scaled: viewBox -246..246 maps to 0..512, so center of viewBox (0,0) maps to pixel 256,256.
# The centroid in the original is at (254.9, 267.3) — offset (251/492*512, ...) — recenter:
# shift traced mask so its content centroid matches original's
ys1, xs1 = np.nonzero(m1); c1 = (xs1.mean(), ys1.mean())
ys2, xs2 = np.nonzero(m2); c2 = (xs2.mean(), ys2.mean())
print(f"orig content centroid {c1[0]:.1f},{c1[1]:.1f}   traced {c2[0]:.1f},{c2[1]:.1f}")

# shift m2 by (c1 - c2)
dx, dy = int(round(c1[0] - c2[0])), int(round(c1[1] - c2[1]))
m2s = np.roll(np.roll(m2, dy, axis=0), dx, axis=1)

inter = (m1 & m2s).sum()
union = (m1 | m2s).sum()
print(f"IoU = {inter / union:.4f}")
print(f"coverage: orig {m1.sum()} px, traced {m2s.sum()} px, ratio {m2s.sum() / m1.sum():.3f}")

# Petal count check on traced render: angular histogram
cy_, cx_ = c2
yy, xx = np.mgrid[0:512, 0:512]
ang = np.degrees(np.arctan2(yy - cy_, xx - cx_))
rad = np.hypot(xx - cx_, yy - cy_)
band = (rad > 120) & (rad < 140) & m2
hist, _ = np.histogram(ang[band], bins=72, range=(-180, 180))
runs = []
in_run = False
for i, h in enumerate(np.concatenate([hist, hist[:1]])):
    if h > 2 and not in_run: start = i; in_run = True
    elif h <= 2 and in_run: runs.append((i - start)); in_run = False
print(f"traced: petal angular runs at r~130: {sorted([r for r in runs if r >= 3], reverse=True)}")
print(f"=> {len([r for r in runs if r >= 3])} petals detected in traced render")
