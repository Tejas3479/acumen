import type { NextConfig } from "next";

const nextConfig = {
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
  // @ts-ignore
  typescript: {
    ignoreBuildErrors: true,
  },
} as any;

export default nextConfig;
