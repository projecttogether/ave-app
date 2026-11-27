// Run a SQL migration file using the DATABASE_URL connection
// Usage: node scripts/run-migration.mjs <path-to-sql-file>

import { readFileSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf-8');

const pool = new Pool({ connectionString });

try {
  console.log(`Running migration: ${sqlFile}`);
  await pool.query(sql);
  console.log('✅ Migration completed successfully');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
