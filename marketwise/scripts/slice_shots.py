#!/usr/bin/env python3
"""Slice tall full-page screenshots into reviewable chunks."""
from PIL import Image
import os

D = "/home/z/my-project/shots/audit"

def slice_img(name, prefix, slice_h):
    im = Image.open(f"{D}/{name}")
    w, h = im.size
    n = (h + slice_h - 1) // slice_h
    for i in range(n):
        top = i * slice_h
        bot = min(h, top + slice_h)
        crop = im.crop((0, top, w, bot))
        # cap width to 1600 for VLM sanity
        if crop.width > 1600:
            ratio = 1600 / crop.width
            crop = crop.resize((1600, int(crop.height * ratio)), Image.LANCZOS)
        crop.save(f"{D}/{prefix}_{i+1:02d}.png", optimize=True)
    return n

n1 = slice_img("home_1440_full.png", "home1440", 2200)
n2 = slice_img("home_390_full.png", "home390", 2400)
print(f"home1440 -> {n1} slices, home390 -> {n2} slices")
