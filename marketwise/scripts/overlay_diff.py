#!/usr/bin/env python3
"""Overlay diff: red = original only, green = traced only, yellow = overlap."""
import numpy as np
from PIL import Image

orig = np.array(Image.open("/home/z/my-project/public/img/logo-mark.png").convert("RGBA"))[:, :, 3]
m1 = orig > 40
tr = np.array(Image.open("/tmp/flower_traced.png").convert("RGBA"))[:, :, 3]
m2 = tr > 40

# align centroids
ys1, xs1 = np.nonzero(m1); c1x, c1y = xs1.mean(), ys1.mean()
ys2, xs2 = np.nonzero(m2); c2x, c2y = xs2.mean(), ys2.mean()
dy, dx = int(round(c1y - c2y)), int(round(c1x - c2x))
m2s = np.roll(np.roll(m2, dy, axis=0), dx, axis=1)

canvas = np.zeros((512, 512, 3), dtype=np.uint8)
canvas[m1 & ~m2s] = [220, 50, 50]     # original only: red
canvas[~m1 & m2s] = [60, 180, 70]     # traced only: green
canvas[m1 & m2s] = [240, 220, 120]    # overlap: yellow

Image.fromarray(canvas).resize((768, 768), Image.NEAREST).save("/home/z/my-project/shots/flower-diff.png")
print("saved flower-diff.png")
print(f"orig-only px: {(m1 & ~m2s).sum()}, traced-only px: {(~m1 & m2s).sum()}, overlap: {(m1 & m2s).sum()}")

# Where is the mismatch concentrated? radial distribution of green (traced-only)
yy, xx = np.mgrid[0:512, 0:512]
rad = np.hypot(xx - c1x, yy - c1y)
g = (~m1 & m2s)
for lo in range(0, 240, 30):
    band = g & (rad >= lo) & (rad < lo + 30)
    print(f"green excess at r {lo:3d}-{lo+30:3d}: {band.sum():6d}")
