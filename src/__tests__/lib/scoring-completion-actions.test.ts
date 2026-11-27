import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import type { QuestionResponse } from '@/lib/questions/completion'

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), admin: vi.fn(), auth: vi.fn(), profile: vi.fn(),
  subOrganizations: vi.fn(), operations: vi.fn(), preferences: vi.fn(), scoring: vi.fn(),
  select: vi.fn(), from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/app/admin/actions', () => ({ checkAdmin: mocks.admin }))
vi.mock('@/lib/datasets/scope', () => ({ getUserScope: mocks.scope, getReflectionOrganizationIds: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  select: mocks.select,
  query: {
    users: { findFirst: mocks.profile },
    subOrganizations: { findMany: mocks.subOrganizations },
    indicatorData: { findMany: mocks.operations },
    operatingReportingPreferences: { findMany: mocks.preferences },
    qualitativeResponses: { findMany: mocks.scoring },
  },
} }))

import { getScoringDataSets } from '@/app/actions/datasets'
import { getAdminScoringDataSets } from '@/app/admin/actions/datasets'
import { getMissingData } from '@/app/actions/missing-data'

type ScoringRow = QuestionResponse & {
  organizationId: string
  organizationName: string
  orgName: string
  subOrganizationId: string
  subOrgName: string
  year: number
  updatedAt: Date | null
}

function answer(questionKey: string, overrides: Partial<ScoringRow> = {}): ScoringRow {
  return {
    questionKey, organizationId: 'org-a', organizationName: 'Organisation A', orgName: 'Organisation A',
    subOrganizationId: 'site-a', subOrgName: 'Site A', year: 2025,
    responseText: null, responseOption: null, responseMultiple: null, responseDate: null,
    responseNumber: null, updatedAt: null, ...overrides,
  }
}

const requiredQuestions = SCORING_QUESTIONS.filter(question => !question.optional)
const emptyAnswers = () => SCORING_QUESTIONS.map(question => answer(question.key))
const requiredAnswers = () => requiredQuestions.map(question => answer(question.key, {
  responseOption: question.options?.[0] ?? null,
  responseText: question.options ? null : 'Answered',
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.scope.mockResolvedValue({ roles: ['org_manager'], organizationId: 'org-a', accessibleSubOrgIds: ['site-a'] })
  mocks.auth.mockResolvedValue({ user: { id: 'user-a', email: 'manager@example.com' } })
  mocks.profile.mockResolvedValue({ id: 'user-a', organizationId: 'org-a', userRoles: [{ roleId: 'org_manager' }] })
  mocks.subOrganizations.mockResolvedValue([{ id: 'site-a', name: 'Site A' }])
  mocks.operations.mockResolvedValue([])
  mocks.preferences.mockResolvedValue([])
  mocks.scoring.mockResolvedValue([])
  const query = { from: mocks.from, innerJoin: mocks.innerJoin, where: mocks.where, orderBy: mocks.orderBy }
  mocks.select.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.innerJoin.mockReturnValue(query)
  mocks.where.mockReturnValue(query)
  mocks.orderBy.mockResolvedValue([])
})

for (const [name, read] of [
  ['scoped', getScoringDataSets], ['admin', getAdminScoringDataSets],
] as const) {
  describe(`${name} scoring completion`, () => {
    it('keeps unsaved datasets absent and saved empty questionnaires at zero', async () => {
      await expect(read()).resolves.toEqual([])
      mocks.orderBy.mockResolvedValue(emptyAnswers())
      await expect(read()).resolves.toEqual([{
        subOrganizationId: 'site-a', subOrganizationName: 'Site A',
        organizationId: 'org-a', organizationName: 'Organisation A', year: 2025,
        responseCount: 0, completeness: 0, lastUpdated: null,
      }])
    })

    it('counts answers independently of other datasets or the active filter', async () => {
      const partial = [answer(requiredQuestions[0].key, { responseOption: 'Ja' })]
      const complete = requiredAnswers().map(row => ({ ...row, subOrganizationId: 'site-b', subOrgName: 'Site B' }))
      mocks.orderBy.mockResolvedValue([...partial, ...complete])
      const all = await read()
      expect(all.find(row => row.subOrganizationId === 'site-a')).toMatchObject({ responseCount: 1, completeness: 1 })
      expect(all.find(row => row.subOrganizationId === 'site-b')).toMatchObject({ responseCount: 95, completeness: 100 })

      mocks.orderBy.mockResolvedValue(partial)
      const filtered = await read({ subOrganizationId: 'site-a', year: 2025 })
      expect(filtered[0]).toEqual(all.find(row => row.subOrganizationId === 'site-a'))
    })

    it('ignores optional answers for completion and uses the latest saved timestamp', async () => {
      const optional = SCORING_QUESTIONS.find(question => question.optional && !question.dependsOn)!
      mocks.orderBy.mockResolvedValue([
        answer(requiredQuestions[0].key, { updatedAt: new Date('2026-03-01T12:00:00Z') }),
        answer(optional.key, { responseText: 'Optional note', updatedAt: new Date('2026-04-01T12:00:00Z') }),
      ])
      const [result] = await read()
      expect(result).toMatchObject({ responseCount: 0, completeness: 0, lastUpdated: '2026-04-01T12:00:00.000Z' })
    })

    it('keeps reporting years separate', async () => {
      mocks.orderBy.mockResolvedValue([
        answer(requiredQuestions[0].key, { year: 2026, responseOption: 'Ja' }),
        answer(requiredQuestions[0].key, { year: 2025 }),
      ])
      expect(await read()).toMatchObject([
        { year: 2026, responseCount: 1, completeness: 1 },
        { year: 2025, responseCount: 0, completeness: 0 },
      ])
    })
  })
}

it('preserves assigned-site and organisation restrictions while filtering scoring answers', async () => {
  await getScoringDataSets({ subOrganizationId: 'other-site', year: 2025 })
  const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0])
  expect(query.params).toEqual(['site-a', 'org-a', 'other-site', 2025])
  expect(query.sql).not.toContain(' or ')
})

it('does not query datasets when the reader has no assigned sites', async () => {
  mocks.scope.mockResolvedValue({ roles: ['basic_user'], organizationId: 'org-a', accessibleSubOrgIds: [] })
  await expect(getScoringDataSets()).resolves.toEqual([])
  expect(mocks.select).not.toHaveBeenCalled()
})

it('tasks and both dataset lists agree about the same questionnaire', async () => {
  const answers = emptyAnswers().map(row => row.questionKey === requiredQuestions[0].key
    ? { ...row, responseOption: 'Ja' }
    : row)
  mocks.scoring.mockResolvedValue(answers)
  mocks.orderBy.mockResolvedValue(answers)
  const [task] = await getMissingData(2025)
  const [scoped] = await getScoringDataSets()
  const [admin] = await getAdminScoringDataSets()
  expect(task).toMatchObject({ missingScoring: 94, firstMissingScoringKey: requiredQuestions[1].key })
  expect(scoped).toMatchObject({ responseCount: 1, completeness: 1 })
  expect(admin).toEqual(scoped)
  expect(task.missingScoring + scoped.responseCount).toBe(95)

  const complete = requiredAnswers()
  mocks.scoring.mockResolvedValue(complete)
  mocks.orderBy.mockResolvedValue(complete)
  expect((await getMissingData(2025))[0]).toMatchObject({ missingScoring: 0, firstMissingScoringKey: null })
  expect((await getScoringDataSets())[0].completeness).toBe(100)
})
