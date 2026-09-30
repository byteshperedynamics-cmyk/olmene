#!/usr/bin/env python3
"""Patch CORS in the 4 edge functions to reflect allowed origins
(prod + preview + localhost), then redeploy."""
import re

FILES = [
    "/home/z/my-project/fnsrc/start-analysis-bundle.ts",
    "/home/z/my-project/fnsrc/advance-analysis-gemini.ts",
    "/home/z/my-project/fnsrc/create-checkout-bundle.ts",
    "/home/z/my-project/fnsrc/create-portal-session-bundle.ts",
]

OLD_CORS = """function corsHeaders(appUrl, env) {
  const origins = [
    appUrl
  ];
  if (env === "dev") origins.push("http://localhost:3000");
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": origins.join(", "),
    Vary: "Origin"
  };
}"""

NEW_CORS = """function corsOriginAllowed(origin) {
  if (!origin) return false;
  return origin === "https://get.marketwiselabs.workers.dev" || /^https:\\/\\/[a-z0-9-]+\\.marketwiselabs\\.workers\\.dev$/.test(origin) || /^https:\\/\\/preview-[a-z0-9-]+\\.space-z\\.ai$/.test(origin) || origin === "http://localhost:3000";
}
function corsHeaders(appUrl, env, reqOrigin) {
  const origin = corsOriginAllowed(reqOrigin) ? reqOrigin : appUrl;
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
}"""

OLD_PREFLIGHT = """function preflight(appUrl, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(appUrl, env)
  });
}"""

NEW_PREFLIGHT = """function preflight(appUrl, env, reqOrigin) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(appUrl, env, reqOrigin)
  });
}"""

for path in FILES:
    src = open(path).read()
    changed = []
    if OLD_CORS in src:
        src = src.replace(OLD_CORS, NEW_CORS); changed.append("corsHeaders")
    elif "corsOriginAllowed" not in src:
        print(f"!! corsHeaders body mismatch in {path}")
    if OLD_PREFLIGHT in src:
        src = src.replace(OLD_PREFLIGHT, NEW_PREFLIGHT); changed.append("preflight")
    src = src.replace(
        "  if (req.method === \"OPTIONS\") return preflight(env.APP_URL, env.ENV);",
        "  if (req.method === \"OPTIONS\") return preflight(env.APP_URL, env.ENV, req.headers.get(\"origin\"));",
    )
    src = src.replace(
        "  const cors = corsHeaders(env.APP_URL, env.ENV);",
        "  const cors = corsHeaders(env.APP_URL, env.ENV, req.headers.get(\"origin\"));",
    )
    open(path, "w").write(src)
    print(f"{path.split('/')[-1]}: patched {changed}")
print("done")
