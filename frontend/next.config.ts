import type { NextConfig } from "next";
import path from "path";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const BACKEND_WS_URL = BACKEND_URL.replace(/^http/, "ws");

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  outputFileTracingRoot: process.env.VERCEL ? undefined : path.join(__dirname, "../"),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.com",
              `connect-src 'self' https://*.clerk.accounts.dev https://clerk.com wss://*.clerk.accounts.dev https://*.onrender.com wss://*.onrender.com https://api-inference.huggingface.co ${BACKEND_URL} ${BACKEND_WS_URL}`,
              "img-src 'self' data: https://images.unsplash.com https://img.clerk.com https://duckduckgo.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "frame-src 'self' https://*.clerk.accounts.dev https://clerk.com",
              "worker-src 'self' blob:",
              `media-src 'self' https://*.onrender.com ${BACKEND_URL} data: blob:`,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
