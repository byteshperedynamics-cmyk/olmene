#!/usr/bin/env python3
"""Find ALL overflow culprits in the Example diagnosis card (and page-wide)
on the live homepage, across viewport widths."""
from playwright.sync_api import sync_playwright
import json

BASE = "https://get.marketwiselabs.workers.dev"

JS = """
(() => {
  const vw = document.documentElement.clientWidth;
  const culprits = [];
  // Walk every element; flag anything extending past the viewport or having
  // horizontal scrollWidth > clientWidth (text clipped / overflowing).
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const issues = [];
    if (r.right > vw + 0.5) issues.push(`past-viewport-right by ${Math.round(r.right - vw)}px`);
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible" && el.clientWidth > 0)
      issues.push(`clipped: scrollW ${el.scrollWidth} > clientW ${el.clientWidth}`);
    if (issues.length) {
      // Only report the innermost offenders: skip if a descendant is also reported later
      culprits.push({
        tag: el.tagName,
        cls: (typeof el.className === "string" ? el.className : "").slice(0, 150),
        text: (el.textContent || "").trim().slice(0, 70),
        w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left),
        sw: el.scrollWidth, cw: el.clientWidth,
        issues,
      });
    }
  }
  // Deduplicate: drop any element whose parent is already in the list with same issue
  return {vw, scrollW: document.documentElement.scrollWidth, culprits: culprits.slice(0, 80)};
})()
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(320, 700), (360, 800), (390, 844), (768, 900), (1280, 800), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1800)
        res = page.evaluate(JS)
        print(f"\n===== viewport {w}x{h} | doc scrollWidth {res['scrollW']} (vw {res['vw']}) =====")
        for c in res["culprits"]:
            txt = c["text"].replace("\n", " ")
            print(f"  <{c['tag']}> {c['issues'][0]} | w={c['w']} sw={c['sw']} cw={c['cw']} | {txt[:60]!r}")
            print(f"      cls: {c['cls'][:130]}")
        # screenshot the example diagnosis card region
        card = page.locator("text=Example diagnosis").first
        try:
            card_locator = page.locator("div").filter(has_text="Example diagnosis").first
            el = page.locator("p", has_text="Example diagnosis").first
            box = el.bounding_box()
            if box:
                page.screenshot(path=f"/home/z/my-project/shots/overflow_{w}_diag.png",
                                clip={"x": max(0, box["x"] - 16), "y": max(0, box["y"] - 16),
                                      "width": min(w, 560), "height": 640})
        except Exception as e:
            print("  (screenshot failed:", e, ")")
        ctx.close()
    b.close()
print("\nDone.")
