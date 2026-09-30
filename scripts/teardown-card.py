#!/usr/bin/env python3
"""Re-render the teardown diagnosis card from the REAL live audit result.

The teardown section shows Olmene's free-diagnosis card for olmene.com itself.
The original image was a screenshot; after the rebrand + 21-check upgrade it is
re-rendered here from the actual production response (same data, same layout,
current brand tokens). Data source: POST /functions/v1/free-audit {"url":
"https://olmene.com"} captured 2026-10-01 (21/21 checks, overall 98).

Outputs: public/img/teardown-001-diagnosis-{480,768,1064}.webp
"""
import json
from PIL import Image, ImageDraw, ImageFont

DATA = json.load(open("/tmp/fa2.json"))  # real production response

SS = 2  # supersample
W = 1064 * SS

# Brand tokens (match globals.css light mode)
OAT = (250, 250, 248)
CARD = (255, 255, 255)
INK = (38, 38, 36)
MUTED = (110, 109, 106)
ELM = (37, 96, 57)          # #256039
ELM_5 = (239, 245, 240)     # primary/5 wash
BORDER = (230, 227, 218)
SECONDARY = (240, 238, 230)
GOOD = (43, 96, 60)

WORK = "/home/roody/Documents/Olmene/_work"

def font(px, semibold=False, mono=False):
    if mono:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", px)
    else:
        f = ImageFont.truetype(f"{WORK}/Newsreader-VF.ttf", px)
        try:
            f.set_variation_by_axes([600 if semibold else 400, 72])
        except Exception:
            pass
    return f

def sans(px, weight=400):
    # Inter isn't on disk; DejaVu Sans is the closest local grotesque
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if weight >= 600 else "")
    return ImageFont.truetype(p, px)

d = DATA
checks = d["passedChecks"]; total = d["totalChecks"]
sc = d["scores"]

# ── layout ─────────────────────────────────────────────────────────────
PAD = 22 * SS
header_h = 52 * SS
ring_area = 128 * SS
body_h = 120 * SS
foot_h = 118 * SS
H = header_h + ring_area + body_h + foot_h + PAD * 2

img = Image.new("RGB", (W, H), OAT)
dr = ImageDraw.Draw(img)

# card
dr.rounded_rectangle([0, 0, W - 1, H - 1], radius=12 * SS, fill=CARD, outline=BORDER, width=1 * SS)

# ── header bar ─────────────────────────────────────────────────────────
dr.rectangle([0, 0, W - 1, header_h], fill=SECONDARY)
dr.rounded_rectangle([0, 0, W - 1, header_h + 12 * SS], radius=12 * SS, fill=SECONDARY)
dr.rectangle([0, header_h - 2 * SS, W - 1, header_h], fill=SECONDARY)

f_title = sans(15 * SS, 600)
dr.text((PAD, header_h // 2), "Free diagnosis — olmene.com", font=f_title, fill=INK, anchor="lm")

def chip(x, label, value):
    f = sans(11.5 * SS)
    tw = dr.textlength(label, font=f)
    pad = 10 * SS
    box = [x, header_h // 2 - 12 * SS, x + tw + 2 * pad, header_h // 2 + 12 * SS]
    dr.rounded_rectangle(box, radius=10 * SS, fill=OAT)
    dr.text((x + pad, header_h // 2), label, font=f, fill=MUTED, anchor="lm")
    return box[2] + 8 * SS

x = W - PAD
for label in (f"{d['highImpactCount']} high-impact", f"{checks}/{total} checks passed"):
    f = sans(11.5 * SS)
    tw = dr.textlength(label, font=f)
    pad = 10 * SS
    x -= tw + 2 * pad
    dr.rounded_rectangle([x, header_h // 2 - 12 * SS, x + tw + 2 * pad, header_h // 2 + 12 * SS], radius=10 * SS, fill=OAT)
    dr.text((x + pad, header_h // 2), label, font=f, fill=MUTED, anchor="lm")
    x -= 8 * SS

# ── score ring ─────────────────────────────────────────────────────────
cy = header_h + PAD + ring_area // 2 - 8 * SS
cx = PAD + 58 * SS
r_out, r_in, arc_w = 52 * SS, 42 * SS, 10 * SS
dr.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=BORDER)
# progress arc (98%) — pieslice from top
sweep = int(360 * sc["overall"] / 100)
dr.pieslice([cx - r_out, cy - r_out, cx + r_out, cy + r_out], -90, -90 + sweep, fill=ELM)
dr.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=CARD)
f_big = font(40 * SS, semibold=True)
dr.text((cx, cy - 6 * SS), str(sc["overall"]), font=f_big, fill=INK, anchor="mm")
f_lab = sans(10.5 * SS)
dr.text((cx, cy + 26 * SS), "marketing readiness", font=f_lab, fill=MUTED, anchor="mm")

# ── score bars ─────────────────────────────────────────────────────────
bx = cx + r_out + 34 * SS
bw = W - bx - PAD - 60 * SS
rows = [("SEO & tech", sc["seo"]), ("Messaging", sc["messaging"]), ("Conversion", sc["conversion"])]
by = cy - (len(rows) * 30 * SS) // 2 + 4 * SS
for name, val in rows:
    f = sans(12.5 * SS, 600)
    dr.text((bx + 60 * SS, by), name, font=f, fill=INK, anchor="lm")
    f_num = sans(12.5 * SS)
    dr.text((W - PAD, by), str(val), font=f_num, fill=MUTED, anchor="lm")
    track_y = by + 9 * SS
    dr.rounded_rectangle([bx + 60 * SS, track_y, W - PAD - 34 * SS, track_y + 6 * SS], radius=3 * SS, fill=BORDER)
    fill_w = int((W - PAD - 34 * SS - (bx + 60 * SS)) * val / 100)
    dr.rounded_rectangle([bx + 60 * SS, track_y, bx + 60 * SS + fill_w, track_y + 6 * SS], radius=3 * SS, fill=GOOD)
    by += 30 * SS

# ── divider ────────────────────────────────────────────────────────────
y = header_h + PAD + ring_area + 4 * SS
dr.line([PAD, y, W - PAD, y], fill=BORDER, width=SS)

# ── opportunity block ──────────────────────────────────────────────────
y += 14 * SS
f_kicker = sans(10.5 * SS, 600)
dr.text((PAD, y), "BIGGEST OPPORTUNITY", font=f_kicker, fill=ELM)
y += 20 * SS
f_opp = sans(15 * SS, 600)
dr.text((PAD, y), d["opportunity"]["title"], font=f_opp, fill=INK)
y += 24 * SS
f_why = sans(12 * SS)
# wrap the 'why' text
import textwrap
for ln in textwrap.wrap(d["opportunity"]["why"], width=118)[:2]:
    dr.text((PAD, y), ln, font=f_why, fill=MUTED)
    y += 17 * SS

# ── checklist strip (the 21 checks) ────────────────────────────────────
y += 10 * SS
labels = [c["check"] for c in DATA["checklist"]]
statuses = [c["status"] for c in DATA["checklist"]]
f_check = sans(10.5 * SS)
x, y0, line_h = PAD, y, 19 * SS
for label, st in zip(labels, statuses):
    tw = dr.textlength(label, font=f_check) + 18 * SS
    if x + tw > W - PAD:
        x = PAD
        y0 += line_h
    color = GOOD if st == "pass" else (150, 120, 40)
    dr.ellipse([x, y0 + 3 * SS, x + 7 * SS, y0 + 10 * SS], fill=color)
    dr.text((x + 11 * SS, y0 + 2 * SS), label, font=f_check, fill=MUTED)
    x += tw

foot = y0 + line_h + 14 * SS
dr.line([PAD, foot, W - PAD, foot], fill=BORDER, width=SS)
f_foot = sans(10.5 * SS)
dr.text((W - PAD, foot + 12 * SS), "21 deterministic checks · free · olmene.com", font=f_foot, fill=MUTED, anchor="lm")

# crop to content and save at 3 widths
bottom = foot + 26 * SS
img = img.crop((0, 0, W, bottom))
for width, ratio_h in [(1064, None), (768, None), (480, None)]:
    out = img.resize((width * SS, int(bottom / SS / (1064 / width) * (1064 / width) / 1)), Image.LANCZOS) if False else img.resize((width, round(bottom / SS * width / 1064)), Image.LANCZOS)
    out.save(f"public/img/teardown-001-diagnosis-{width}.webp", "WEBP", quality=90, method=6)
    print(f"wrote teardown-001-diagnosis-{width}.webp", out.size)
