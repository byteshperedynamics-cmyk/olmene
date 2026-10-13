#!/usr/bin/env python3
"""Regenerate Olmene brand raster assets from the vector petal path.

Monochrome brand ("Obsidian, Silver & Steel", docs/design/DESIGN.md):
the mark and wordmark carry no colour; shapes are locked (recolour only).

Outputs (all committed):
  public/img/logo-full-480.webp   480x96 lockup, ink on transparent (JSON-LD logo)
  src/app/opengraph-image.png     1200x630 social card, white on obsidian
  src/app/icon.png                512x512 white flower on an obsidian tile (reads on light and dark tabs)
  src/app/apple-icon.png          180x180 apple touch icon, full-bleed obsidian

The wordmark font is the site's own Newsreader (next/font). Run `npx next build`
or `npm run dev` once so .next/static/media holds it, or pass a path:
  python3 scripts/brand-assets.py [path/to/Newsreader.woff2|ttf]
"""
import glob, math, re, sys
from PIL import Image, ImageDraw, ImageFont

PETAL_D = "M-64.4 -63.9 C-67.3 -69.0 -77.2 -85.4 -81.4 -94.4 C-85.6 -103.5 -87.9 -110.7 -89.8 -118.1 C-91.7 -125.5 -92.6 -132.5 -92.8 -138.9 C-93.0 -145.2 -92.3 -150.4 -91.1 -156.2 C-89.9 -162.0 -88.2 -168.0 -85.6 -173.5 C-83.0 -179.1 -79.7 -184.6 -75.7 -189.6 C-71.6 -194.6 -66.8 -199.6 -61.2 -203.5 C-55.7 -207.3 -48.6 -210.5 -42.3 -212.7 C-36.0 -214.8 -30.9 -216.2 -23.7 -216.4 C-16.5 -216.6 -6.2 -215.7 0.9 -213.8 C8.0 -212.0 12.8 -209.5 18.9 -205.3 C25.0 -201.1 33.0 -193.7 37.5 -188.6 C42.1 -183.6 43.6 -180.7 46.1 -175.0 C48.6 -169.3 51.3 -162.1 52.4 -154.3 C53.5 -146.6 53.6 -137.2 52.7 -128.8 C51.8 -120.4 47.9 -108.3 46.9 -104.2 L46.9 -104.2 C37.7 -88.6 14.1 -10.1 -8.2 -10.7 C-30.4 -11.3 -75.3 -95.7 -86.5 -107.8 C-97.7 -119.8 -84.7 -95.8 -75.2 -82.8 C-65.7 -69.8 -31.4 -33.0 -29.6 -29.8 C-27.8 -26.7 -58.6 -58.2 -64.4 -63.9 Z"

INK = (9, 9, 11, 255)            # #09090B obsidian ink
CANVAS = (9, 9, 11)              # #09090B
WHITE = (250, 250, 250, 255)     # #FAFAFA
ZINC = (161, 161, 170, 255)      # #A1A1AA zinc-400 body
FAINT = (150, 150, 159, 255)     # #96969F
SS = 4                            # supersample factor for smooth edges

def parse_path(d):
    """Sample the petal path into a polygon (absolute M/C/L/Z only)."""
    toks = re.findall(r"([MCLZ])([^MCLZ]*)", d)
    pts, cur = [], (0.0, 0.0)
    for cmd, args in toks:
        nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", args)]
        if cmd == "M":
            cur = (nums[0], nums[1]); pts.append(cur)
        elif cmd == "L":
            cur = (nums[0], nums[1]); pts.append(cur)
        elif cmd == "C":
            for i in range(0, len(nums), 6):
                p0, p1, p2, p3 = cur, (nums[i], nums[i+1]), (nums[i+2], nums[i+3]), (nums[i+4], nums[i+5])
                for t in [j/40 for j in range(1, 41)]:
                    mt = 1 - t
                    x = mt**3*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t**3*p3[0]
                    y = mt**3*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t**3*p3[1]
                    pts.append((x, y))
                cur = p3
    return pts

PETAL = parse_path(PETAL_D)

def flower(draw, cx, cy, r, color):
    """Draw the five-petal mark centred at (cx, cy) with radius r (supersampled px)."""
    s = r / 216.0  # petal tip sits ~216 units from centre
    for k in range(5):
        a = math.radians(k * 72)
        ca, sa = math.cos(a), math.sin(a)
        poly = [((x*ca - y*sa)*s + cx, (x*sa + y*ca)*s + cy) for x, y in PETAL]
        draw.polygon(poly, fill=color)

def _find_font(family, italic=False):
    """A font file next/font downloaded into .next (or the path given on the command line)."""
    if family == "Newsreader" and len(sys.argv) > 1:
        return sys.argv[1]
    for f in sorted(glob.glob(".next/static/media/*.woff2")):
        try:
            name, style = ImageFont.truetype(f, 12).getname()
        except Exception:
            continue
        if not name.startswith(family) or (style == "Italic") != italic:
            continue
        # next/font splits each family into subsets: keep the one with Latin letters.
        probe = ImageFont.truetype(f, 40)
        if bytes(probe.getmask("o")) != bytes(probe.getmask("\ue000")):
            return f
    sys.exit(f"{family} not found in .next/static/media: run `npm run dev` or `npx next build` first, or pass a font path.")

def variable_font(family, px, weight):
    f = ImageFont.truetype(_find_font(family), px)
    try:
        axes = f.get_variation_axes()
        vals = []
        for ax in axes:
            name = ax.get("name", b"") if isinstance(ax, dict) else b""
            name = name.decode() if isinstance(name, bytes) else str(name)
            if "eight" in name or name.lower() == "wght":
                vals.append(weight)
            else:                          # opsz: prefer display sizes
                vals.append(min(ax.get("maximum", 72), 72))
        f.set_variation_by_axes(vals)
    except Exception as e:
        print("  (variation axes unavailable:", e, ")")
    return f

def wordmark_font(px):
    return variable_font("Newsreader", px, 600)   # SemiBold, as in the header lockup

def save_webp(img, path, ss=SS):
    img = img.resize((img.width//ss, img.height//ss), Image.LANCZOS)
    img.save(path, "WEBP", quality=92, method=6)
    print("wrote", path, img.size)

# ── 1. logo-full-480.webp ──────────────────────────────────────────────
W, H = 480*SS, 96*SS
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
mark_r = 36*SS
flower(d, mark_r + 6*SS, H//2, mark_r, INK)
f = wordmark_font(52*SS)
bbox = d.textbbox((0, 0), "olmene", font=f)
tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
tx = 2*mark_r + 24*SS
ty = H//2 - th//2 - bbox[1]
d.text((tx, ty), "olmene", font=f, fill=INK)
save_webp(img, "public/img/logo-full-480.webp")

# ── 2. opengraph-image.png ─────────────────────────────────────────────
W, H = 1200*SS, 630*SS
img = Image.new("RGB", (W, H), CANVAS)
# Top-centre white cone, like the hero wash (very low alpha).
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
for i in range(60, 0, -1):
    r = i / 60
    gd.ellipse((W/2 - 620*SS*r, -380*SS*r, W/2 + 620*SS*r, 380*SS*r), fill=int(26 * (1 - r) ** 1.6))
img.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), glow)
d = ImageDraw.Draw(img)
# Hairline frame
d.rounded_rectangle((40*SS, 40*SS, W - 40*SS, H - 40*SS), radius=28*SS, outline=(38, 38, 44), width=2*SS)
flower(d, W//2, H//2 - 120*SS, 84*SS, WHITE)
f = wordmark_font(132*SS)
bbox = d.textbbox((0, 0), "olmene", font=f)
tw = bbox[2]-bbox[0]
d.text((W//2 - tw/2 - bbox[0], H//2 + 8*SS - bbox[1]), "olmene", font=f, fill=WHITE)
tag = "Find what is costing you customers. Ship the fix."
ft = variable_font("Inter", 30*SS, 400)
bbox = d.textbbox((0, 0), tag, font=ft)
d.text((W//2 - (bbox[2]-bbox[0])/2 - bbox[0], H//2 + 170*SS - bbox[1]), tag, font=ft, fill=ZINC)
img = img.resize((1200, 630), Image.LANCZOS)
img.save("src/app/opengraph-image.png", "PNG", optimize=True)
print("wrote src/app/opengraph-image.png (1200, 630)")

# ── 3+4. favicons: white flower on an obsidian tile ───────────────────
for size, path, radius in [(512, "src/app/icon.png", 0.22), (180, "src/app/apple-icon.png", 0)]:
    W = size*SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W - 1, W - 1), radius=int(W*radius), fill=CANVAS + (255,))
    flower(d, W//2, W//2, W*0.36, WHITE)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    print("wrote", path, (size, size))
