import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";
import { sentryTunnelTarget, sentryTunnelUrl } from "./lib/security/sentry-tunnel";

const tunnel = sentryTunnelTarget(sentryOptions.dsn);

Sentry.init({
  ...sentryOptions,
  // The /monitoring tunnel is a same-origin rewrite (next.config.ts) that the proxy
  // checks first, and it forwards request headers to Sentry. Omit credentials so
  // the session cookie never leaves our domain.
  ...(tunnel && { tunnel: sentryTunnelUrl(tunnel) }),
  transportOptions: { fetchOptions: { credentials: "omit" } },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
