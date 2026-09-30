#!/usr/bin/env python3
"""Measure the specific polish items flagged by the audit:
1. 'What's inside' card bottom alignment (equal heights?)
2. Hero -> demo section gap on desktop
3. Pricing feature list spacing
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    m = page.evaluate("""
    () => {
      const out = {};
      // 1. What's-inside cards: bottom alignment
      const cards = [...document.querySelectorAll('section .card-lift')].map(c => {
        const r = c.getBoundingClientRect();
        return {t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), head: c.querySelector('h3')?.textContent};
      });
      out.whatsInsideCards = cards;
      // 2. hero form bottom -> demo section top
      const form = document.querySelector('#free-diagnosis');
      const demo = document.querySelector('#demo');
      if (form && demo) {
        const fr = form.getBoundingClientRect();
        const dr = demo.getBoundingClientRect();
        // account for scroll: use offsetTop chain instead
        const abs = el => el.getBoundingClientRect().top + window.scrollY;
        out.heroFormBottom = Math.round(abs(form) + form.offsetHeight);
        out.demoTop = Math.round(abs(demo));
        out.gap = out.demoTop - out.heroFormBottom;
      }
      return out;
    }
    """)
    print("WHATS-INSIDE CARDS:", *[f"\n  {c['head']}: top={c['t']} bottom={c['b']} h={c['h']}" for c in m["whatsInsideCards"]])
    print(f"\nHERO->DEMO GAP: {m['gap']}px (heroFormBottom={m['heroFormBottom']}, demoTop={m['demoTop']})")

    # pricing page: feature list row spacing
    page.goto(BASE + "/pricing/", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    pm = page.evaluate("""
    () => {
      const lists = [...document.querySelectorAll('ul')].filter(u => u.querySelector('svg'));
      return lists.slice(0, 3).map(u => {
        const cs = getComputedStyle(u);
        const first = u.querySelector('li');
        const fr = first.getBoundingClientRect();
        return {gap: cs.rowGap, liH: Math.round(fr.height), n: u.children.length, txt: first.textContent.slice(0, 30)};
      });
    }
    """)
    print("\nPRICING LISTS:", pm)
    ctx.close()
    b.close()
