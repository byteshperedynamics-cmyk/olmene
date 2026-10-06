import type { NextConfig } from "next";

// Baseline security headers for every route. HSTS leaves out includeSubDomains
// so an HTTP-only subdomain is never locked out. The CSP only forbids framing,
// plugins and <base> hijacking; script sources stay open on purpose (inline
// theme and consent boot scripts, Google Analytics after consent).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The Google sign-in redirects carry ?code&state; keep their stricter policy.
      { source: "/api/auth/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Match the deployed URL shape (/pricing/, /app/, /login/, …)
  trailingSlash: true,
  typescript: {
    // All 23 historical errors fixed 2026-10-01 (stale report types, missing
    // import, RHF eager-path bug worked around in app/new/page.tsx).
    // A type error now fails the build again — keep it that way.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
