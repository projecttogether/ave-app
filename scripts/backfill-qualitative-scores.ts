import { db } from '../src/lib/db'
import { indicatorData, qualitativeResponses } from '../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { calculateRegionalScore, calculateSeasonalScore, calculateGuestSatisfactionScore } from '../src/lib/qualitative/scoring'

async function main() {
  console.log('Backfilling qualitative scores...')

  // Get all unique subOrgs and years that have qualitative responses
  const uniqueCombos = await db.selectDistinct({
    orgId: qualitativeResponses.organizationId,
    subOrgId: qualitativeResponses.subOrganizationId,
    year: qualitativeResponses.reportingYear
  }).from(qualitativeResponses)

  for (const combo of uniqueCombos) {
    const rows = await db.query.qualitativeResponses.findMany({
      where: and(
        eq(qualitativeResponses.organizationId, combo.orgId),
        eq(qualitativeResponses.subOrganizationId, combo.subOrgId),
        eq(qualitativeResponses.reportingYear, combo.year)
      )
    })

    // Build form data
    const data: any = {}
    for (const row of rows) {
      data[row.questionKey] = {
        text: row.responseText || '',
        option: row.responseOption || '',
        multiple: row.responseMultiple || [],
        date: row.responseDate ? row.responseDate.toISOString() : ''
      }
    }

    const regionalScore = calculateRegionalScore(data)
    const seasonalScore = calculateSeasonalScore(data)
    const guestSatisfactionScore = calculateGuestSatisfactionScore(data)

    if (regionalScore !== null || seasonalScore !== null || guestSatisfactionScore !== null) {
      const now = new Date()
      await db.insert(indicatorData).values({
        organizationId: combo.orgId,
        subOrganizationId: combo.subOrgId,
        reportingYear: combo.year,
        reportingMonth: 0,
        regionalScoringResult: regionalScore !== null ? regionalScore.toString() : null,
        seasonalScoringResult: seasonalScore !== null ? seasonalScore.toString() : null,
        guestSatisfactionScoringResult: guestSatisfactionScore !== null ? guestSatisfactionScore.toString() : null,
        createdAt: now,
        updatedAt: now
      }).onConflictDoUpdate({
        target: [
          indicatorData.organizationId,
          indicatorData.subOrganizationId,
          indicatorData.reportingYear,
          indicatorData.reportingMonth
        ],
        set: {
          regionalScoringResult: regionalScore !== null ? regionalScore.toString() : null,
          seasonalScoringResult: seasonalScore !== null ? seasonalScore.toString() : null,
          guestSatisfactionScoringResult: guestSatisfactionScore !== null ? guestSatisfactionScore.toString() : null,
          updatedAt: now
        }
      })
      console.log(`Updated subOrg ${combo.subOrgId} for year ${combo.year}: Regional=${regionalScore}, Seasonal=${seasonalScore}, Guest=${guestSatisfactionScore}`)
    }
  }

  console.log('Done backfilling.')
  process.exit(0)
}

main().catch(console.error)
