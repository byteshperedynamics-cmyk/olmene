#!/usr/bin/env python3
"""Slice the dark-mode tall shots for VLM review."""
from PIL import Image

D = "/home/z/my-project/shots/audit"

def slice_img(name, prefix, slice_h, maxw=1600):
    im = Image.open(f"{D}/{name}")
    w, h = im.size
    n = (h + slice_h - 1) // slice_h
    for i in range(n):
        crop = im.crop((0, i * slice_h, w, min(h, (i + 1) * slice_h)))
        if crop.width > maxw:
            r = maxw / crop.width
            crop = crop.resize((maxw, int(crop.height * r)), Image.LANCZOS)
        crop.save(f"{D}/{prefix}_{i+1:02d}.png", optimize=True)
    return n

print(slice_img("dark_home_1440.png", "dark1440", 2200), "slices")
print(slice_img("dark_sample_1440.png", "dsample", 1800), "slices")
