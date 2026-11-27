import { db } from '@/lib/db'
import { qualitativeResponses } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { indicatorScopeConditions, type IndicatorScope } from './scope'
import { aggregateQualitativeScores } from '@/lib/qualitative/scoring'

export async function loadQualitativeScores(scope: IndicatorScope, year: number) {
    const rows = await db.query.qualitativeResponses.findMany({
        where: and(...indicatorScopeConditions(qualitativeResponses, scope), eq(qualitativeResponses.reportingYear, year)),
    })
    return aggregateQualitativeScores(rows)
}
