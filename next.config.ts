import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /* Acknowledge Turbopack (Next.js 16 default) and silence the
     webpack-config-without-turbopack-config warning. */
  turbopack: {},
};

export default nextConfig;
