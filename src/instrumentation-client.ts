import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

Sentry.init({
  ...sentryOptions,
  // The /monitoring tunnel is a same-origin rewrite that forwards request headers
  // to Sentry. Omit credentials so the session cookie never leaves our domain.
  transportOptions: { fetchOptions: { credentials: "omit" } },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
