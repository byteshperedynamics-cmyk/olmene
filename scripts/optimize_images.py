#!/usr/bin/env python3
"""Generate optimized WebP variants for Marketwise static images.

Targets (from Lighthouse mobile "Improve image delivery" — est savings 324 KiB):
- logo-full.png             1280x257 PNG 68KB, shown at h-8 (32px)      -> 480x96 WebP
- logo-mark-terracotta.png   512x512 PNG 56KB, shown at 14x14          -> 42x42 WebP
- teardown-001-diagnosis    1500x745 PNG 115KB, shown ≤532px col        -> 480/768/1064 WebP
- marketwise-demo-poster    1600x900 JPG 104KB, shown ≤864px (max-w-4xl)-> 960x540 WebP
"""
from PIL import Image
import os

IMG = "/home/z/my-project/public/img"
VID = "/home/z/my-project/public/video"

def save_webp(im, path, quality=82, method=6):
    im.save(path, "WEBP", quality=quality, method=method)
    kb = os.path.getsize(path) / 1024
    print(f"  {path}: {im.size[0]}x{im.size[1]} {kb:.1f} KB")
    return kb

def resize_to_width(im, w):
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)

total_before = 0
total_after = 0

print("== logo-full.png (brand lockup, h-8 display) ==")
im = Image.open(f"{IMG}/logo-full.png")
total_before += os.path.getsize(f"{IMG}/logo-full.png")
# 480x96 covers 3x DPR; alpha channel must survive (dark:invert relies on transparency)
save_webp(resize_to_width(im, 480), f"{IMG}/logo-full-480.webp")
total_after += os.path.getsize(f"{IMG}/logo-full-480.webp")

print("== logo-mark-terracotta.png (14px display) ==")
im2 = Image.open(f"{IMG}/logo-mark-terracotta.png")
total_before += os.path.getsize(f"{IMG}/logo-mark-terracotta.png")
save_webp(im2.resize((42, 42), Image.LANCZOS), f"{IMG}/logo-mark-42.webp")
total_after += os.path.getsize(f"{IMG}/logo-mark-42.webp")

print("== teardown-001-diagnosis.png (report screenshot, ≤532px col) ==")
im3 = Image.open(f"{IMG}/teardown-001-diagnosis.png")
total_before += os.path.getsize(f"{IMG}/teardown-001-diagnosis.png")
for w in (480, 768, 1064):
    save_webp(resize_to_width(im3, w), f"{IMG}/teardown-001-diagnosis-{w}.webp")
    total_after += os.path.getsize(f"{IMG}/teardown-001-diagnosis-{w}.webp")

print("== marketwise-demo-poster.jpg (video poster, ≤864px) ==")
im4 = Image.open(f"{VID}/marketwise-demo-poster.jpg")
total_before += os.path.getsize(f"{VID}/marketwise-demo-poster.jpg")
save_webp(resize_to_width(im4, 960), f"{VID}/marketwise-demo-poster-960.webp", quality=78)
total_after += os.path.getsize(f"{VID}/marketwise-demo-poster-960.webp")

print(f"\nBefore (4 files, as served): {total_before/1024:.1f} KB")
print(f"After  (WebP set, all variants incl. 2x/3x): {total_after/1024:.1f} KB")
