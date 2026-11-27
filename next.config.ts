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
  // Browser events reach Sentry through /monitoring, same-origin under the Content
  // Security Policy (src/instrumentation-client.ts). The proxy checks each request
  // first (src/proxy.ts); these rewrites then forward it to Sentry, as the
  // `tunnelRoute` of @sentry/nextjs 11.4 did. From 11.17 that option answers the
  // route ahead of the proxy, so the app sets the tunnel up itself.
  async rewrites() {
    const org = { type: "query" as const, key: "o", value: "(?<orgid>\\d+)" };
    const project = { type: "query" as const, key: "p", value: "(?<projectid>\\d+)" };
    const region = { type: "query" as const, key: "r", value: "(?<region>[a-z]{2})" };
    return {
      beforeFiles: [
        {
          source: "/monitoring(/?)",
          has: [org, project, region],
          destination: "https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0",
        },
        {
          source: "/monitoring(/?)",
          has: [org, project],
          destination: "https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
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
});
