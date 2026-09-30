#!/usr/bin/env bash
# Test the EXACT build/deploy command strings that connect.py will configure,
# against simulated repo shapes. Validates quoting/expansion end-to-end.
set -u
cd /home/z/my-project

# Extract the two constants by importing the script as a module
python3 - << 'PY' > /tmp/cmds.sh
import importlib.util
spec = importlib.util.spec_from_file_location("connect", "scripts/olmene/connect.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import shlex
with open("/tmp/cmds.sh", "w") as f:
    f.write("BUILD_CMD=" + shlex.quote(m.BUILD_CMD_DEFAULT) + "\n")
    f.write("DEPLOY_CMD=" + shlex.quote(m.DEPLOY_CMD_DEFAULT) + "\n")
PY
source /tmp/cmds.sh
echo "BUILD_CMD  = $BUILD_CMD"
echo "DEPLOY_CMD = $DEPLOY_CMD"
echo

pass=0; fail=0
for scenario in vite astro plain workerrepo publicdir; do
  rm -rf /tmp/fakerepo && mkdir -p /tmp/fakerepo && cd /tmp/fakerepo
  case $scenario in
    vite)   mkdir dist && echo "<html>vite</html>" > dist/index.html && echo '{"name":"x"}' > package.json;;
    astro)  mkdir dist && echo "<html>astro</html>" > dist/index.html && mkdir src && echo '{}' > package.json && echo 'export {}' > src/x.js;;
    plain)  echo "<html>plain</html>" > index.html && echo "readme" > README.md;;
    workerrepo) printf '%s' '{"name":"olmene","main":"src/index.js","compatibility_date":"2026-09-01"}' > wrangler.jsonc && mkdir src && echo 'export default{}' > src/index.js;;
    publicdir) mkdir public && echo "<html>pub</html>" > public/index.html;;
  esac
  echo "=== $scenario ==="
  if eval "$BUILD_CMD"; then echo "  build: ok"; else echo "  build: FAIL"; fail=$((fail+1)); fi
  if eval "${DEPLOY_CMD/npx wrangler deploy/echo '[WOULD DEPLOY]';}"; then :; else echo "  deploy(eval): FAIL"; fail=$((fail+1)); fi
  if [ "$scenario" = "workerrepo" ]; then
    grep -q '"main":"src/index.js"' wrangler.jsonc && echo "  kept existing wrangler.jsonc: ok" || { echo "  OVERWROTE user config: FAIL"; fail=$((fail+1)); }
  else
    if [ -f wrangler.jsonc ] && python3 -c "import json;json.load(open('wrangler.jsonc'))" 2>/dev/null; then
      d=$(python3 -c "import json;print(json.load(open('wrangler.jsonc'))['assets']['directory'])")
      echo "  generated valid wrangler.jsonc, assets dir: $d"
      case $scenario in
        vite|astro) [ "$d" = "dist" ] && echo "  correct dir: ok" || { echo "  WRONG dir"; fail=$((fail+1)); };;
        plain) [ "$d" = "." ] && echo "  correct dir: ok" || { echo "  WRONG dir"; fail=$((fail+1)); };;
        publicdir) [ "$d" = "public" ] && echo "  correct dir: ok" || { echo "  WRONG dir"; fail=$((fail+1)); };;
      esac
    else
      echo "  generated wrangler.jsonc INVALID/MISSING: FAIL"; fail=$((fail+1))
    fi
  fi
  pass=$((pass+1))
done
rm -rf /tmp/fakerepo
echo
echo "scenarios run: $pass, failures: $fail"
[ "$fail" -eq 0 ] && echo "ALL ADAPTIVE COMMAND TESTS PASSED"
