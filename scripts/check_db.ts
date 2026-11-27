import { db } from '../src/lib/db'
import { indicatorData, qualitativeResponses } from '../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'

async function check() {
  const data = await db.query.indicatorData.findMany({
    where: and(
        eq(indicatorData.reportingMonth, 0),
        eq(indicatorData.reportingYear, 2026)
    )
  })
  console.log("Indicator Data (month 0):")
  console.log(data)

  const qual = await db.query.qualitativeResponses.findMany({
      where: eq(qualitativeResponses.reportingYear, 2026) // Using correct table field
  })
  // Print a summary of qualitative responses
  const seasonalQual = qual.filter(q => q.indicatorSlug === 'seasonal')
  console.log("Seasonal Qualitative responses count:", seasonalQual.length)
  if (seasonalQual.length > 0) {
      console.log("Sample response:", seasonalQual[0])
      
      // Let's manually calculate the score from DB data
      const { calculateScoreForIndicator } = require('../src/lib/qualitative/scoring')
      const grouped: Record<string, any> = {}
        for (const r of seasonalQual) {
            if (!grouped[r.subOrganizationId]) grouped[r.subOrganizationId] = {}
            grouped[r.subOrganizationId][r.questionKey] = {
                option: r.responseOption || ''
            }
        }
        for (const sId in grouped) {
            const score = calculateScoreForIndicator(grouped[sId], 'seasonal')
            console.log(`Calculated score for subOrg ${sId}:`, score)
        }
  }

  process.exit(0)
}

check().catch(console.error)
