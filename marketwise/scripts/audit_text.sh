#!/usr/bin/env bash
# Site-wide text/character audit: all public routes at 3 breakpoints.
# Checks: horizontal overflow, elements wider than viewport, broken chars.
set -uo pipefail

BASE="http://localhost:3100"
ROUTES=("/" "/pricing/" "/sample-report/" "/login/" "/legal/terms" "/legal/privacy")
SIZES=("390 844" "768 1024" "1280 800")

AUDIT_JS='
(() => {
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  // find offending elements (wider than viewport)
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      const cls = (el.className && typeof el.className === "string") ? el.className.split(" ").slice(0,3).join(".") : "";
      bad.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
      if (bad.length >= 5) break;
    }
  }
  // broken/tofu characters in visible text
  const tofu = (document.body.innerText.match(/[\uFFFD\u25A1\uF8FF]/g) || []).length;
  // text clipped by its container (common truncation bugs): elements with overflow hidden whose scrollWidth exceeds clientWidth significantly AND no line-clamp/truncate intent
  const clipped = [];
  for (const el of document.querySelectorAll("p, h1, h2, h3, h4, span, a, button, td, li")) {
    const cs = getComputedStyle(el);
    if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2) {
      const cls = (typeof el.className === "string") ? el.className.split(" ").slice(0,2).join(".") : "";
      clipped.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} ${el.textContent.trim().slice(0,40)}`);
      if (clipped.length >= 4) break;
    }
  }
  return JSON.stringify({ vw, overflowX, bad, tofu, clipped });
})()
'

for route in "${ROUTES[@]}"; do
  for size in "${SIZES[@]}"; do
    set -- $size
    W=$1; H=$2
    agent-browser set viewport "$W" "$H" > /dev/null 2>&1
    agent-browser open "$BASE$route" > /dev/null 2>&1
    agent-browser wait --load networkidle > /dev/null 2>&1 || true
    RES=$(agent-browser eval "$AUDIT_JS" 2>/dev/null | tail -1)
    echo "[$W x $H] $route -> $RES"
  done
done
