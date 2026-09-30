#!/usr/bin/env python3
"""Task 24 — demo video poster treatment.
The raw screenshot is text-dense and legible, which reads as "wall of small
text" instead of "invitation to play". Darken + blur + desaturate it so the
play button owns the frame. Bonus: the processed WebP is smaller than the
original (it was also a Lighthouse offender at 101KB).
"""
from PIL import Image, ImageEnhance, ImageFilter

SRC = "/home/z/my-project/public/video/marketwise-demo-poster-960.webp"
OUT = "/home/z/my-project/public/video/marketwise-demo-poster-dark-960.webp"
W = 960

im = Image.open(SRC).convert("RGB")
print("source:", im.size, im.mode)

# Downscale to 960w (poster is displayed ~896px max)
if im.width > W:
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)

# Blur: strong enough that the text stops being readable
im = im.filter(ImageFilter.GaussianBlur(radius=5))

# Darken substantially + desaturate: the terracotta play button pops
im = ImageEnhance.Brightness(im).enhance(0.52)
im = ImageEnhance.Color(im).enhance(0.55)

im.save(OUT, "WEBP", quality=68, method=6)
import os
print("wrote:", OUT, os.path.getsize(OUT), "bytes",
      f"({os.path.getsize(OUT)/1024:.1f} KiB)")
