import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
