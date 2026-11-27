import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// This account has access only to authentication tables and audit-log insertion.
// Never import it into data actions; those must use the scoped database module.
export const authPool = new Pool({ connectionString: process.env.AUTH_DATABASE_URL })
export const authDb = drizzle(authPool, { schema })
