import type { NextConfig } from "next";

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
  async redirects() {
    return [
      // links stored in notifications by the database (act_request) → employee app
      { source: "/me/requests", has: [{ type: "query", key: "id", value: "(?<id>\\d+)" }], destination: "/m/requests/:id", permanent: false },
      { source: "/me/requests", destination: "/m/requests", permanent: false },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
