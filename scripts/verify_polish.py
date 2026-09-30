#!/usr/bin/env python3
"""Final local verification of polish changes."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1. Skip link present + becomes visible on focus
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    skip = page.evaluate("""
    () => {
      const a = document.querySelector('a[href="#main-content"]');
      if (!a) return null;
      a.focus();
      const cs = getComputedStyle(a);
      return {present: true, visibleOnFocus: cs.position === 'fixed' && cs.display !== 'none',
              clip: cs.clip || cs.clipPath, w: Math.round(a.getBoundingClientRect().width)};
    }
    """)
    print("SKIP LINK:", skip)
    main = page.evaluate("() => { const m = document.getElementById('main-content'); return m ? m.tagName : null; }")
    print("MAIN TARGET:", main)

    # 2. Anchor navigation: #faq heading not hidden under sticky header
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.click("a[href='#faq']") if page.locator("a[href='#faq']").count() else page.evaluate("location.hash = '#faq'")
    page.wait_for_timeout(900)
    faq = page.evaluate("""
    () => {
      const h = document.querySelector('#faq h2');
      const header = document.querySelector('header');
      if (!h || !header) return null;
      const hr = header.getBoundingClientRect();
      const hr2 = h.getBoundingClientRect();
      return {headingTop: Math.round(hr2.top), headerBottom: Math.round(hr.bottom),
              visible: hr2.top >= hr.bottom - 2};
    }
    """)
    print("ANCHOR #faq:", faq)

    # 3. scroll-smooth on html
    smooth = page.evaluate("() => getComputedStyle(document.documentElement).scrollBehavior")
    print("SCROLL BEHAVIOR:", smooth)
    ctx.close()

    # 4. pricing list spacing at 390
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.goto(BASE + "/pricing/", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    pm = page.evaluate("""
    () => {
      const ul = [...document.querySelectorAll('ul')].find(u => u.textContent.includes('full marketing analyses'));
      if (!ul) return null;
      const lis = [...ul.children];
      const gaps = lis.slice(1).map((li, i) => Math.round(li.getBoundingClientRect().top - (lis[i].getBoundingClientRect().bottom)));
      return {n: lis.length, gaps};
    }
    """)
    print("PRICING LIST GAPS:", pm)
    page.screenshot(path="/home/z/my-project/shots/audit/pricing_390_after.png", full_page=False)
    ctx.close()

    # 5. Example diagnosis final shot (light, 390 + 1440)
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        el = page.locator("p", has_text="Example diagnosis").first
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(700)
        box = el.bounding_box()
        page.screenshot(path=f"/home/z/my-project/shots/audit/final_diag_{w}.png",
                        clip={"x": 0, "y": max(0, box["y"] - 20), "width": w, "height": 680})
        ctx.close()
    b.close()
print("done")
