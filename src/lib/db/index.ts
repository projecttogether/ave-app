import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { validateEnv } from "@/lib/env";
import { TenantPool } from './tenant-pool';
import { scopeContext } from './scope-context';
import { auth } from '@/auth';
import { cache } from 'react';

// Validate all required environment variables at startup
if (process.env.npm_lifecycle_event !== "build") {
  validateEnv();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.npm_lifecycle_event !== "build") {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as {
  pool?: Pool;
};

const pool = globalForDb.pool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

import * as schema from "./schema";
// ...
const requestAuth = cache(async () => auth());
const tenantPool = new TenantPool(pool, async () => {
  const session = await requestAuth();
  return { userId: session?.user?.id ?? null, ...scopeContext.getStore() };
});
export const db = drizzle(tenantPool, { schema });

// Public content uses the same restricted account, with no authenticated context.
export const publicDb = drizzle(new TenantPool(pool, async () => ({ userId: null })), { schema });
