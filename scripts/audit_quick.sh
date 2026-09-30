#!/usr/bin/env bash
# Quick post-deploy regression audit (reduced matrix of audit_text_live.sh):
# 4 key routes x 2 viewports with identical checks + HTTP checks for all routes.
set -uo pipefail
BASE="${BASE:-https://olmene.com}"
ROUTES=("/" "/pricing/" "/sample-report/" "/login/")
SIZES=("390 844" "1440 900")

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
  return JSON.stringify({ vw, overflowX, bad, tofu });
})()
'

echo "== HTTP checks (all routes)"
for route in "/" "/pricing/" "/sample-report/" "/login/" "/legal/terms" "/legal/privacy" "/app/agent/" "/sitemap.xml"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$BASE$route")
  echo "  $route -> $CODE"
done

echo "== Layout checks (overflow / wide elements / tofu)"
FAIL=0
for route in "${ROUTES[@]}"; do
  for size in "${SIZES[@]}"; do
    set -- $size
    W=$1; H=$2
    agent-browser set viewport "$W" "$H" > /dev/null 2>&1
    agent-browser open "$BASE$route" > /dev/null 2>&1
    agent-browser wait --load networkidle --timeout 20000 > /dev/null 2>&1 || true
    RES=$(agent-browser eval "$AUDIT_JS" 2>/dev/null | tail -1)
    VERDICT=$(python3 -c "
import json
raw = '''$RES'''.strip()
try:
    r = json.loads(raw)
except Exception:
    try: r = json.loads(raw[1:-1].encode().decode('unicode_escape'))
    except Exception: r = {'vw':0,'overflowX':'?','bad':['PARSE_FAIL'],'tofu':'?'}
bad = r.get('bad', []); tofu = r.get('tofu', 0); ox = r.get('overflowX', 0)
issues = []
if isinstance(ox,(int,float)) and ox > 1: issues.append(f'overflowX={ox}')
if bad: issues.append('wide:' + ';'.join(bad[:3]))
if isinstance(tofu,(int,float)) and tofu > 0: issues.append(f'tofu={tofu}')
print('FAIL ' + ' | '.join(issues) if issues else 'PASS')
" 2>/dev/null)
    echo "[$W x $H] $route -> $VERDICT"
    [[ "$VERDICT" == FAIL* ]] && FAIL=1
  done
done
echo "AUDIT_EXIT=$FAIL"
