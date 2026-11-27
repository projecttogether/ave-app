import { NextResponse } from 'next/server';
import { publicDb as db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { FORMULA_REVISION } from '@/lib/indicators/revision';

export async function GET() {
  try {
    const result = await db.execute(sql`SELECT indicator_formula_revision() AS revision`);
    if (result.rows[0]?.revision !== FORMULA_REVISION) {
      return NextResponse.json({ status: 'error', detail: 'formula revision mismatch' }, { status: 503 });
    }
    const commit = process.env.SOURCE_COMMIT?.trim();
    return NextResponse.json({ status: 'ok' }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        ...(commit ? { 'X-Deployment-Id': createHash('sha256').update(commit).digest('hex') } : {}),
      },
    });
  } catch {
    return NextResponse.json({ status: 'error', detail: 'database unreachable' }, { status: 503 });
  }
}
import { createHash } from 'node:crypto';
