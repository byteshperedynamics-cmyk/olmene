#!/usr/bin/env python3
"""Prepare Marketwise logo assets from the source files in assets/.

Source: assets/Logo.png (1254x1254 mark on white), assets/Full_Logo.png (1536x1024 lockup on white).
Outputs:
  public/img/logo-mark.png             transparent, ink-black flower mark, 512x512 (6% pad)
  public/img/logo-mark-terracotta.png  transparent, terracotta #D97757 mark, 512x512
  public/img/logo-full.png             transparent, ink-black full lockup (mark + wordmark), width 1280
  src/app/icon.png                     512x512 favicon: rounded terracotta tile + cream mark
  src/app/apple-icon.png               180x180 full-bleed terracotta tile + cream mark (iOS masks itself)
  src/app/opengraph-image.png          1200x630 oat bg + black full logo centered
"""
from PIL import Image, ImageDraw
import os

ROOT = "/home/z/my-project"
ASSETS = os.path.join(ROOT, "assets")
PUB_IMG = os.path.join(ROOT, "public", "img")
APP_DIR = os.path.join(ROOT, "src", "app")

BG_L = 254.0   # near-white background luminance
FG_L = 10.0    # near-black mark luminance

INK = (16, 15, 14)          # warm ink black
TERRACOTTA = (217, 119, 87)  # #D97757 brand primary
CREAM = (245, 244, 239)      # #F5F4EF dark-mode foreground
OAT = (250, 249, 245)        # #FAF9F5 site background


def extract_alpha_mark(src_path: str) -> Image.Image:
    """Return an RGBA image whose alpha is coverage of the dark mark (white bg removed)."""
    im = Image.open(src_path).convert("RGB")
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # Luminance (Rec.601) — background is uniform near-white
            L = 0.299 * r + 0.587 * g + 0.114 * b
            cov = (BG_L - L) / (BG_L - FG_L)  # 0 at bg, 1 at mark
            if cov < 0:
                cov = 0.0
            elif cov > 1:
                cov = 1.0
            # Keep a hint of the original dark tone for edge smoothness
            op[x, y] = (16, 15, 14, int(round(cov * 255)))
    return out


def crop_to_content(im: Image.Image, thresh: int = 10) -> tuple:
    """Return (bbox) of pixels with alpha >= thresh."""
    alpha = im.getchannel("A")
    return alpha.point(lambda a: 255 if a >= thresh else 0).getbbox()


def recolor(im: Image.Image, color: tuple) -> Image.Image:
    """Flat-recolor an RGBA image keeping alpha."""
    solid = Image.new("RGBA", im.size, color + (255,))
    solid.putalpha(im.getchannel("A"))
    return solid


def pad_to_square(im: Image.Image, frac: float) -> Image.Image:
    w, h = im.size
    side = int(round(max(w, h) * (1 + 2 * frac)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas


def make_tile(size: int, radius_frac: float, mark: Image.Image, rounded: bool) -> Image.Image:
    """Terracotta tile (optionally rounded) with cream mark centered at ~62% coverage."""
    tile = Image.new("RGBA", (size, size), TERRACOTTA + (255,))
    if rounded:
        mask = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(mask)
        r = int(round(size * radius_frac))
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
        tile.putalpha(mask)
    # mark at 62% of tile
    m = int(round(size * 0.62))
    mark_small = mark.resize((m, m), Image.LANCZOS)
    tile.alpha_composite(mark_small, ((size - m) // 2, (size - m) // 2))
    return tile


def main():
    os.makedirs(PUB_IMG, exist_ok=True)

    # ---- 1. Standalone flower mark ----
    mark = extract_alpha_mark(os.path.join(ASSETS, "Logo.png"))
    bbox = crop_to_content(mark)
    mark_cropped = mark.crop(bbox)
    print(f"mark content bbox: {bbox} -> cropped {mark_cropped.size}, aspect {mark_cropped.size[0]/mark_cropped.size[1]:.3f}")

    mark_square = pad_to_square(mark_cropped, frac=0.06)
    mark_512 = mark_square.resize((512, 512), Image.LANCZOS)
    mark_512.save(os.path.join(PUB_IMG, "logo-mark.png"))

    terracotta_512 = recolor(mark_512, TERRACOTTA)
    terracotta_512.save(os.path.join(PUB_IMG, "logo-mark-terracotta.png"))

    cream_512 = recolor(mark_512, CREAM)

    # ---- 2. Full lockup ----
    full = extract_alpha_mark(os.path.join(ASSETS, "Full_Logo.png"))
    fbbox = crop_to_content(full)
    full_cropped = full.crop(fbbox)
    fw, fh = full_cropped.size
    print(f"full content bbox: {fbbox} -> cropped {full_cropped.size}, aspect {fw/fh:.3f}")
    # symmetric padding for a little breathing room
    pad_x = int(round(fw * 0.015))
    pad_y = int(round(fh * 0.05))
    canvas = Image.new("RGBA", (fw + 2 * pad_x, fh + 2 * pad_y), (0, 0, 0, 0))
    canvas.paste(full_cropped, (pad_x, pad_y), full_cropped)
    target_w = 1280
    target_h = int(round(canvas.size[1] * target_w / canvas.size[0]))
    full_out = canvas.resize((target_w, target_h), Image.LANCZOS)
    full_out.save(os.path.join(PUB_IMG, "logo-full.png"))
    print(f"logo-full.png: {full_out.size}, aspect {target_w/target_h:.4f}")

    # ---- 3. Favicon (rounded tile) + apple icon (full-bleed) ----
    icon = make_tile(512, 0.225, cream_512, rounded=True)
    icon.save(os.path.join(APP_DIR, "icon.png"))
    apple = make_tile(180, 1.0, cream_512, rounded=False)
    apple.save(os.path.join(APP_DIR, "apple-icon.png"))

    # ---- 4. OpenGraph image 1200x630: oat bg, black full logo centered ----
    og = Image.new("RGB", (1200, 630), OAT)
    logo_w = 880
    logo_h = int(round(canvas.size[1] * logo_w / canvas.size[0]))
    logo_black = canvas.resize((logo_w, logo_h), Image.LANCZOS)
    og.paste(logo_black, ((1200 - logo_w) // 2, (630 - logo_h) // 2), logo_black)
    og.save(os.path.join(APP_DIR, "opengraph-image.png"))

    # remove unused scaffold decoy
    decoy = os.path.join(ROOT, "public", "logo.svg")
    if os.path.exists(decoy):
        os.remove(decoy)
        print("removed unused public/logo.svg")

    for f in ["logo-mark.png", "logo-mark-terracotta.png", "logo-full.png"]:
        p = os.path.join(PUB_IMG, f)
        print(f, os.path.getsize(p) // 1024, "KB")
    for f in ["icon.png", "apple-icon.png", "opengraph-image.png"]:
        p = os.path.join(APP_DIR, f)
        print(f, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
