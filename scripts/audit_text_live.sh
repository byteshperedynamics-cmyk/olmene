#!/usr/bin/env bash
# Site-wide text/character audit against the LIVE site: public routes × 6 breakpoints.
# Checks: horizontal overflow, elements wider than viewport, broken/tofu chars,
# unintended clipping. Run after deploy; expects agent-browser on PATH.
set -uo pipefail

BASE="https://get.marketwiselabs.workers.dev"
ROUTES=("/" "/pricing/" "/sample-report/" "/login/" "/legal/terms" "/legal/privacy")
SIZES=("320 700" "390 844" "768 1024" "1024 768" "1280 800" "1440 900")

AUDIT_JS='
(() => {
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      const cls = (el.className && typeof el.className === "string") ? el.className.split(" ").slice(0,3).join(".") : "";
      bad.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
      if (bad.length >= 5) break;
    }
  }
  const tofu = (document.body.innerText.match(/[\uFFFD\u25A1\uF8FF]/g) || []).length;
  const clipped = [];
  for (const el of document.querySelectorAll("p, h1, h2, h3, h4, span, a, button, td, li, dt, dd")) {
    const cs = getComputedStyle(el);
    if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2) {
      const cls = (typeof el.className === "string") ? el.className.split(" ").slice(0,2).join(".") : "";
      clipped.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${el.textContent.trim().slice(0,36)}"`);
      if (clipped.length >= 4) break;
    }
  }
  return JSON.stringify({ vw, overflowX, bad, tofu, clipped });
})()
'

FAIL=0
for route in "${ROUTES[@]}"; do
  for size in "${SIZES[@]}"; do
    set -- $size
    W=$1; H=$2
    agent-browser set viewport "$W" "$H" > /dev/null 2>&1
    agent-browser open "$BASE$route" > /dev/null 2>&1
    agent-browser wait --load networkidle > /dev/null 2>&1 || true
    RES=$(agent-browser eval "$AUDIT_JS" 2>/dev/null | tail -1)
    # parse + verdict
    VERDICT=$(python3 -c "
import json,sys
try:
    r = json.loads('''$RES'''.strip('\"').encode().decode('unicode_escape') if False else '''$RES''')
except Exception:
    # agent-browser wraps output in quotes; strip
    raw = '''$RES'''.strip()
    try: r = json.loads(raw)
    except Exception:
        try: r = json.loads(raw[1:-1].encode().decode('unicode_escape'))
        except Exception: r = {'vw':0,'overflowX':'?','bad':['PARSE_FAIL'],'tofu':'?','clipped':[]}
bad = r.get('bad', []); clipped = r.get('clipped', []); tofu = r.get('tofu', 0); ox = r.get('overflowX', 0)
issues = []
if isinstance(ox,(int,float)) and ox > 1: issues.append(f'overflowX={ox}')
if bad: issues.append('wide:' + ';'.join(bad[:3]))
if isinstance(tofu,(int,float)) and tofu > 0: issues.append(f'tofu={tofu}')
if clipped: issues.append('clipped:' + ';'.join(clipped[:3]))
print('FAIL ' + ' | '.join(issues) if issues else 'PASS')
" 2>/dev/null)
    echo "[$W x $H] $route -> $VERDICT"
    if [[ "$VERDICT" == FAIL* ]]; then FAIL=1; fi
  done
done
echo "AUDIT_EXIT=$FAIL"
