import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`
    SELECT id, name FROM organizations LIMIT 5;
  `);
  console.log('Orgs:', result.rows);
  
  const curYearResult = await db.execute(sql`
    SELECT organization_id, reporting_year, count(*) as c FROM indicator_data GROUP BY organization_id, reporting_year;
  `);
  console.log('Indicator data counts:', curYearResult.rows);
  
  const orgId = curYearResult.rows[0]?.organization_id;
  if (orgId) {
      const p = await db.execute(sql`
        SELECT * FROM get_org_percentiles(${orgId}::uuid, 2026)
      `);
      console.log('Percentiles for', orgId, ':', p.rows);
  }
}

main().catch(console.error).finally(() => process.exit(0));
