import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'csv-parse/sync'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'

const KITCHEN_A = vi.hoisted(() => '33333333-3333-4333-8333-333333333333')
const mocks = vi.hoisted(() => ({ rows: vi.fn(), answers: vi.fn(), profile: vi.fn(), kitchen: vi.fn(), select: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  query: { indicatorData: { findMany: mocks.rows }, qualitativeResponses: { findMany: mocks.answers },
    users: { findFirst: mocks.profile }, subOrganizations: { findFirst: mocks.kitchen } },
  select: mocks.select,
} }))
vi.mock('@/app/admin/actions', () => ({ checkAdmin: vi.fn().mockResolvedValue({ user: { id: 'user' } }) }))
vi.mock('@/lib/datasets/scope', () => ({
  getUserScope: vi.fn().mockResolvedValue({ userId: 'user', roles: ['org_manager'], organizationId: 'org-a', accessibleSubOrgIds: [KITCHEN_A] }),
  getReflectionOrganizationIds: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }))
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { readOperatingDataset } from '@/lib/datasets/operating'
import { exportDataSetsCsv } from '@/app/actions/dataset-export'
import { exportIndicatorDataCsv } from '@/app/actions/export'
import { getIndicatorDataSetDetail } from '@/app/actions/datasets'
import { getAdminIndicatorDataSetDetail } from '@/app/admin/actions/datasets'

const question = SCORING_QUESTIONS.find(q => q.indicator === 'regional' && q.options?.includes('Ja'))!
const row = (fields = {}) => ({ id: 'row', organizationId: 'org-a', subOrganizationId: KITCHEN_A, reportingYear: 2025, reportingMonth: 0,
  totalFoodSpend: '1000', regionalScoringResult: '95', seasonalScoringResult: '95', guestSatisfactionScoringResult: '95',
  organization: { name: 'Org A' }, subOrganization: { name: 'Kitchen A', foodWasteBaseDate: null, foodWasteBaseAmount: '100' },
  createdAt: null, updatedAt: null, ...fields })
const answer = (fields = {}) => ({ organizationId: 'org-a', subOrganizationId: KITCHEN_A, reportingYear: 2025,
  indicatorSlug: 'regional', questionKey: question.key, responseOption: 'Ja', ...fields })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.mockResolvedValue([row()])
  mocks.answers.mockResolvedValue([answer()])
  mocks.profile.mockResolvedValue({ organizationId: 'org-a' })
  mocks.kitchen.mockResolvedValue({ name: 'Kitchen A' })
  mocks.select.mockReturnValue({ from: () => ({
    where: async () => [{ id: 'org-a' }],
    innerJoin: () => ({ where: () => ({ limit: async () => [{ name: 'Kitchen A', organizationName: 'Org A' }] }) }),
  }) })
})

function csvScores(csv: string) {
  return parse<Record<string, string>>(csv, { columns: true }).map(row => row['Regional Score'])
}

async function allReadPaths() {
  const detail = await getIndicatorDataSetDetail(KITCHEN_A, 2025)
  const adminDetail = await getAdminIndicatorDataSetDetail(KITCHEN_A, 2025)
  const csv = await exportDataSetsCsv('operating', { year: 2025 })
  const adminCsv = await exportIndicatorDataCsv(2025)
  return { detail, adminDetail, csv, adminCsv }
}

describe('operating dataset reads', () => {
  it('uses live scores in both details and both exports, including answer changes', async () => {
    for (const [option, expected] of [['Ja', '10'], ['Nein', '0'], [null, null]] as const) {
      mocks.answers.mockResolvedValue(option === null ? [] : [answer({ responseOption: option })])
      const result = await allReadPaths()
      expect(result.detail.rows[0].regionalScore).toBe(expected)
      expect(result.adminDetail.rows[0].regionalScore).toBe(expected)
      expect(csvScores(result.csv)).toEqual([expected ?? ''])
      expect(csvScores(result.adminCsv)).toEqual([expected ?? ''])
      expect(result.detail.rows[0].totalFoodSpend).toBe('1000')
    }
  })

  it('clears obsolete monthly scores through every read path without querying answers', async () => {
    mocks.rows.mockResolvedValue([row({ reportingMonth: 1 })])
    const result = await allReadPaths()
    expect(result.detail.rows[0].regionalScore).toBeNull()
    expect(result.adminDetail.rows[0].regionalScore).toBeNull()
    expect(csvScores(result.csv)).toEqual([''])
    expect(csvScores(result.adminCsv)).toEqual([''])
    expect(mocks.answers).not.toHaveBeenCalled()
  })

  it('keeps questionnaire reads within the returned kitchens and years', async () => {
    const original = row()
    mocks.rows.mockResolvedValue([original, row({ reportingMonth: 1 }), row({ reportingYear: 2024 })])
    const result = await readOperatingDataset({ where: undefined, orderBy: [] })
    expect(result.map(row => row.regionalScoringResult)).toEqual(['10', null, null])
    expect(result[0]).toMatchObject({ organization: { name: 'Org A' }, subOrganization: { foodWasteBaseAmount: '100' } })
    expect(original.regionalScoringResult).toBe('95')
    expect(mocks.answers).toHaveBeenCalledTimes(1)
    const statement = new PgDialect().sqlToQuery(mocks.answers.mock.calls[0][0].where)
    expect(statement.params).toEqual(['org-a', KITCHEN_A, 2025, 'org-a', KITCHEN_A, 2024])
  })

  it('returns empty datasets without a questionnaire query', async () => {
    mocks.rows.mockResolvedValue([])
    expect(await readOperatingDataset({ where: undefined, orderBy: [] })).toEqual([])
    expect(mocks.answers).not.toHaveBeenCalled()
  })
})
