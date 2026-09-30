#!/usr/bin/env python3
"""Identify the overflowing anchor on the 320px homepage."""
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"

JS = """
(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body a")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) {
      out.push({
        text: el.textContent.trim().slice(0, 60),
        href: el.getAttribute("href"),
        cls: el.className,
        w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left),
        parentCls: el.parentElement?.className?.slice(0, 120) ?? "",
        parentTag: el.parentElement?.tagName ?? "",
      });
    }
  }
  return out;
})()
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 320, "height": 700})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    for hit in page.evaluate(JS):
        print("TEXT:", hit["text"])
        print("HREF:", hit["href"])
        print("CLS :", hit["cls"][:160])
        print(f"BOX : left={hit['left']} w={hit['w']} right={hit['right']}")
        print("PARENT:", hit["parentTag"], hit["parentCls"])
        print("----")
    b.close()
