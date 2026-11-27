# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
COPY vendor ./vendor
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

RUN apk add --no-cache postgresql postgresql-client
# Tests run with the same environment as CI, never with production build
# variables. Coolify skips RUN instructions that mount a secret (see below);
# nothing provides NO_BUILD_VARIABLES.
RUN --mount=type=secret,id=NO_BUILD_VARIABLES \
    npm run formulas:check && npm run typecheck && npm run lint && npm run test:run
RUN --mount=type=secret,id=NO_BUILD_VARIABLES node scripts/test-indicator-sql-local.mjs
# Public SDK settings are embedded in the browser bundle at build time.
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG NEXT_PUBLIC_SENTRY_ENABLED=true
# Coolify supplies SOURCE_COMMIT; other builders can pass SENTRY_RELEASE.
ARG SOURCE_COMMIT
ARG SENTRY_RELEASE
# Coolify passes all build variables as secrets when Docker Build Secrets is on.
# It does not add mounts to a RUN instruction that already mounts a secret.
# Separate environment names preserve ARG defaults when optional secrets are absent.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SOURCE_COMMIT,env=SENTRY_BUILD_SOURCE_COMMIT \
    --mount=type=secret,id=SENTRY_RELEASE,env=SENTRY_BUILD_RELEASE \
    --mount=type=secret,id=NEXT_PUBLIC_SENTRY_ENVIRONMENT,env=SENTRY_BUILD_ENVIRONMENT \
    --mount=type=secret,id=NEXT_PUBLIC_SENTRY_ENABLED,env=SENTRY_BUILD_ENABLED \
    SENTRY_RELEASE="${SENTRY_BUILD_RELEASE:-${SENTRY_RELEASE:-${SENTRY_BUILD_SOURCE_COMMIT:-$SOURCE_COMMIT}}}" \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT="${SENTRY_BUILD_ENVIRONMENT:-$NEXT_PUBLIC_SENTRY_ENVIRONMENT}" \
    NEXT_PUBLIC_SENTRY_ENABLED="${SENTRY_BUILD_ENABLED:-$NEXT_PUBLIC_SENTRY_ENABLED}" \
    npm run build
RUN npx --yes esbuild scripts/run-migrate.ts --bundle --platform=node --target=node22 --external:pg --external:pg-native --outfile=migrate-bundle.cjs
RUN npx --yes esbuild src/lib/db/startup.ts --bundle --platform=node --target=node22 --external:pg --external:pg-native --outfile=startup-bundle.cjs

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Keep base packages up to date. Coolify's health check needs curl: it probes
# localhost, and BusyBox wget tries only ::1 while Next.js listens on IPv4.
RUN apk upgrade --no-cache && apk add --no-cache curl

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Application files stay owned by root, so a compromised server process cannot
# rewrite its own code. The runtime user only reads them.
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/migrate-bundle.cjs ./
COPY --from=builder /app/startup-bundle.cjs ./
COPY --from=builder /app/scripts/docker-entrypoint.mjs ./

# Next.js writes its data and image caches here at runtime; nothing else is writable.
RUN mkdir -p .next/cache && chown nextjs:nodejs .next/cache

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(4000) }).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "docker-entrypoint.mjs"]
