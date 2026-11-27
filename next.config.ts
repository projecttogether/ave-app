import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Keep RSC headers visible so the proxy can reject invalid router state.
  skipProxyUrlNormalize: true,
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  experimental: {
    memoryBasedWorkersCount: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // The proxy adds a fresh nonce for rendered pages. Other responses
            // retain this restrictive baseline.
            value: contentSecurityPolicy(undefined, isDev),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "projecttogether",
  project: "ave-app",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Keep browser events same-origin under the app's Content Security Policy.
  tunnelRoute: "/monitoring",
});
