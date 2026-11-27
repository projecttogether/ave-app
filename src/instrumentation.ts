import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }

  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.npm_lifecycle_event !== 'build') {
    const { verifyDatabaseIsolation } = await import('@/lib/db/verify-isolation');
    await verifyDatabaseIsolation();
  }
}

export const onRequestError = Sentry.captureRequestError;
