import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Self-hosted on the customer's server: build a standalone server bundle for Docker
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Content-Security-Policy is per request (nonce) → proxy.ts; the static ones live here
  async headers() {
    return [{ source: "/(.*)", headers: STATIC_SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      // links stored in notifications by the database (act_request) → employee app
      { source: "/me/requests", has: [{ type: "query", key: "id", value: "(?<id>\\d+)" }], destination: "/m/requests/:id", permanent: false },
      { source: "/me/requests", destination: "/m/requests", permanent: false },
      // the employee app has no login page of its own — people guess /m/login
      { source: "/m/login", destination: "/login?next=/m", permanent: false },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
