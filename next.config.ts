import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Match the deployed URL shape (/pricing/, /app/, /login/, …)
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
