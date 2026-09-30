#!/usr/bin/env python3
"""Screenshot + measure the Example diagnosis card in detail."""
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(320, 700), (390, 844), (768, 900), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        # the header label of the card
        el = page.locator("p", has_text="Example diagnosis").first
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(600)
        box = el.bounding_box()
        if box:
            page.screenshot(path=f"/home/z/my-project/shots/diag_{w}.png",
                            clip={"x": 0, "y": max(0, box["y"] - 24),
                                  "width": w, "height": min(760, h * 0.9)})
        # measure the ring label vs ring circle
        m = page.evaluate("""
        () => {
          const ringWrap = [...document.querySelectorAll('div')].find(d => {
            const cs = d.className || '';
            return typeof cs === 'string' && cs.includes('size-28');
          });
          if (!ringWrap) return null;
          const rr = ringWrap.getBoundingClientRect();
          const label = [...ringWrap.querySelectorAll('div')].find(d => /readiness/i.test(d.textContent) && d.textContent.length < 30);
          const num = ringWrap.querySelector('.font-display');
          const svg = ringWrap.querySelector('svg');
          const circle = svg ? svg.querySelectorAll('circle')[1] : null;
          const lr = label ? label.getBoundingClientRect() : null;
          const nr = num ? num.getBoundingClientRect() : null;
          const out = {ring: {x: rr.x, w: rr.width, y: rr.y, h: rr.height}};
          if (lr) out.label = {x: lr.x, w: lr.width, right: lr.right};
          if (nr) out.num = {x: nr.x, w: nr.width, right: nr.right};
          // measure circle inner diameter in px (r=50, viewBox 112)
          if (svg) { const sr = svg.getBoundingClientRect(); out.svg = {w: sr.width, h: sr.height}; }
          // header row badges
          const badges = [...document.querySelectorAll('span.font-mono')].map(s => {
            const r = s.getBoundingClientRect();
            return {t: s.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width)};
          });
          out.badges = badges.slice(0, 6);
          // the small "high" chip and its parent title line
          const sev = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'high');
          if (sev) { const r = sev.getBoundingClientRect(); out.sevHigh = {x: r.x, right: r.right, w: r.width, h: r.height}; }
          return out;
        }
        """)
        print(f"\n== {w}px ==")
        print(m)
        ctx.close()
    b.close()
