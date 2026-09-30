#!/usr/bin/env python3
"""Contrast math for the Marketwise palette — WCAG 2.1 ratios for candidate token changes."""
import math

def oklch_to_srgb(L, C, h):
    # oklch -> oklab
    hr = math.radians(h)
    a, b = C * math.cos(hr), C * math.sin(hr)
    # oklab -> linear sRGB (Björn Ottosson)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    def gamma(c):
        if c <= 0.0031308: return 12.92 * c
        return 1.055 * (max(c, 0) ** (1 / 2.4)) - 0.055
    r, g, bb = (min(1, max(0, gamma(c))) for c in (r, g, bb))
    return (round(r * 255), round(g * 255), round(bb * 255))

def srgb_to_hex(rgb):
    return "#%02X%02X%02X" % rgb

def rel_lum(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(hex1, hex2):
    def parse(h):
        h = h.lstrip("#")
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    l1, l2 = rel_lum(parse(hex1)), rel_lum(parse(hex2))
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def show(name, L, C, h, against):
    hexv = srgb_to_hex(oklch_to_srgb(L, C, h))
    ratios = {bg: round(contrast(hexv, bg), 2) for bg in against}
    print(f"{name:44s} {hexv}  " + "  ".join(f"on {bg}: {r}" for bg, r in ratios.items()))

# Site backgrounds
OAT = "#FAF9F5"      # light bg
WHITE = "#FFFFFF"    # card
SEC30 = "#F5F3ED"    # secondary/30 over oat (approx)
DARK = "#262624"     # dark bg
CARD_D = "#30302E"   # dark card

print("=== CURRENT ===")
show("primary oklch(0.699 0.127 45)", 0.699, 0.127, 45, [WHITE, OAT, DARK])
show("muted-fg oklch(0.516 0.006 90)", 0.516, 0.006, 90, [WHITE, OAT, SEC30])
show("score-good oklch(0.55 0.095 150)", 0.55, 0.095, 150, [WHITE, OAT])
show("score-mid oklch(0.68 0.115 75)", 0.68, 0.115, 75, [WHITE, OAT])
show("score-bad oklch(0.56 0.16 30)", 0.56, 0.16, 30, [WHITE, OAT])
show("dark muted-fg oklch(0.72 0.005 95)", 0.72, 0.005, 95, [DARK, CARD_D])

print("\n=== LIGHT PRIMARY CANDIDATES (need >=4.5 as text on oat AND with white text) ===")
for L in (0.57, 0.58, 0.59, 0.60, 0.61):
    show(f"primary oklch({L} 0.135 45)", L, 0.135, 45, [WHITE, OAT, SEC30])

print("\n=== DARK BUTTON FG CANDIDATES on #D97757 ===")
for L, C, h in [(0.20, 0.01, 90), (0.245, 0.005, 90), (0.25, 0.02, 60)]:
    hexv = srgb_to_hex(oklch_to_srgb(L, C, h))
    print(f"primary-fg oklch({L} {C} {h}) {hexv}  on #D97757: {round(contrast(hexv, '#D97757'), 2)}")

print("\n=== DARK MODE primary #D97757 as text ===")
print(f"#D97757 on {DARK}: {round(contrast('#D97757', DARK), 2)}   on {CARD_D}: {round(contrast('#D97757', CARD_D), 2)}")
