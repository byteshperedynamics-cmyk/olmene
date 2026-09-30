#!/usr/bin/env python3
"""Find the exact C5 symmetry center: optimize (cx, cy) so that rotating the
mask by 72 deg around it maximizes self-overlap. Then find exact phase."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = "/home/z/my-project/public/img/logo-mark.png"
mask = np.array(Image.open(SRC).convert("RGBA"))[:, :, 3] > 40

def rot_overlap(cx, cy):
    """Rotate mask 72 deg around (cx, cy), return IoU with original."""
    # Use scipy affine: shift center to origin, rotate, shift back
    H, W = mask.shape
    # rotation matrix for ndimage.affine_transform: output(o) -> input(i)
    th = np.radians(72.0)
    R = np.array([[np.cos(th), np.sin(th)], [-np.sin(th), np.cos(th)]])
    # i = R @ (o - c) + c  =>  i = R@o + (c - R@c)
    c = np.array([cx, cy])
    offset = c - R @ c
    m = ndi.affine_transform(mask.astype(np.float32), R, offset=offset,
                             order=1, mode="constant", cval=0) > 0.5
    inter = (mask & m).sum()
    union = (mask | m).sum()
    return inter / union

# Coarse-to-fine search
best = (254.9, 267.3)
best_v = rot_overlap(*best)
print(f"start centroid IoU under 72deg rotation: {best_v:.4f}")
for step in [4, 2, 1, 0.5, 0.25]:
    improved = True
    while improved:
        improved = False
        for dx, dy in [(step, 0), (-step, 0), (0, step), (0, -step),
                       (step, step), (-step, -step), (step, -step), (-step, step)]:
            v = rot_overlap(best[0] + dx, best[1] + dy)
            if v > best_v + 1e-6:
                best_v, best, improved = v, (best[0] + dx, best[1] + dy), True
    print(f"step {step}: center=({best[0]:.2f},{best[1]:.2f}) IoU={best_v:.4f}")

print(f"\nFINAL symmetry center: ({best[0]:.3f}, {best[1]:.3f})  self-IoU@72deg = {best_v:.4f}")
np.save("/tmp/sym_center.npy", np.array(best))
