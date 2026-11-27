import { and, eq, or, isNull, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { qualitativeResponses, indicatorData } from '@/lib/db/schema'
import { aggregateQualitativeScores, EMPTY_QUALITATIVE_SCORES } from '@/lib/qualitative/scoring'

/** Callers supply their authorized row restriction and display order. The
 * dataset owns names, baseline metadata and current annual questionnaire scores. */
export async function readOperatingDataset(options: { where: SQL | undefined; orderBy: SQL[] }) {
  const rows = await db.query.indicatorData.findMany({
    ...options, where: and(options.where, isNull(indicatorData.supersededAt)),
    with: {
      organization: { columns: { name: true } },
      subOrganization: { columns: { name: true, foodWasteBaseDate: true, foodWasteBaseAmount: true } },
    },
  })
  const keyFor = (row: { organizationId: string; subOrganizationId: string; reportingYear: number }) =>
    `${row.organizationId}:${row.subOrganizationId}:${row.reportingYear}`
  const annual = [...new Map(rows.filter(row => row.reportingMonth === 0).map(row => [keyFor(row), row])).values()]
  const answers = annual.length ? await db.query.qualitativeResponses.findMany({
    where: or(...annual.map(row => and(
      eq(qualitativeResponses.organizationId, row.organizationId),
      eq(qualitativeResponses.subOrganizationId, row.subOrganizationId),
      eq(qualitativeResponses.reportingYear, row.reportingYear),
    ))),
  }) : []
  const grouped = new Map<string, typeof answers>()
  for (const answer of answers) {
    const key = keyFor(answer)
    const group = grouped.get(key) ?? []
    group.push(answer)
    grouped.set(key, group)
  }
  const scores = new Map([...grouped].map(([key, group]) => [key, aggregateQualitativeScores(group)]))
  const asString = (value: number | null) => value === null ? null : String(value)
  return rows.map(row => {
    const score = row.reportingMonth === 0 ? scores.get(keyFor(row)) ?? EMPTY_QUALITATIVE_SCORES : EMPTY_QUALITATIVE_SCORES
    return { ...row,
      plantBasedScoringResult: asString(score.plant_based), organicScoringResult: asString(score.organic),
      fairTradeScoringResult: asString(score.fair_trade), foodWasteScoringResult: asString(score.food_waste),
      regionalScoringResult: asString(score.regional), seasonalScoringResult: asString(score.seasonal),
      guestSatisfactionScoringResult: asString(score.guest_satisfaction),
    }
  })
}
