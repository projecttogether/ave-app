import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getAllReflectionDataSets, getReflectionDataSetDetail, getReflectionDataSets } from '@/app/actions/reflection'
import { REFLECTION_QUESTIONS } from '@/lib/reflection/constants'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  profile: vi.fn(),
  organization: vi.fn(),
  responses: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: { findFirst: mocks.profile },
      organizations: { findFirst: mocks.organization },
      intakeResponses: { findMany: mocks.responses },
    },
    select: mocks.select,
  },
}))

function setProfile(role: string, organizationId: string | null = 'org-a') {
  mocks.profile.mockResolvedValue({ id: 'user-a', organizationId, userRoles: [{ roleId: role }] })
}

function answer(questionKey: string, overrides = {}) {
  return {
    organizationId: 'org-a',
    organizationName: 'Organisation A',
    questionKey,
    responseText: null,
    responseOption: null,
    responseMultiple: null,
    responseDate: null,
    responseNumber: null,
    responseBoolean: null,
    updatedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'user-a', email: 'manager@example.com' } })
  setProfile('org_manager')
  const query = { from: mocks.from, innerJoin: mocks.innerJoin, where: mocks.where, orderBy: mocks.orderBy }
  mocks.select.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.innerJoin.mockReturnValue(query)
  mocks.where.mockReturnValue(query)
  mocks.orderBy.mockResolvedValue([])
  mocks.organization.mockResolvedValue({ name: 'Organisation A' })
  mocks.responses.mockResolvedValue([])
})

describe('reflection dataset access', () => {
  it('requires authentication for both list and detail', async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(getReflectionDataSets()).rejects.toThrow('Nicht eingeloggt')
    await expect(getReflectionDataSetDetail('org-a')).rejects.toThrow('Nicht eingeloggt')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.responses).not.toHaveBeenCalled()
  })

  it.each(['basic_user', 'unknown'])('rejects %s before reading reflection data', async role => {
    setProfile(role)
    await expect(getReflectionDataSets()).rejects.toThrow('Zugriff verweigert')
    await expect(getReflectionDataSetDetail('org-a')).rejects.toThrow('Zugriff verweigert')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.responses).not.toHaveBeenCalled()
  })

  it.each(['org_manager', 'org_view_only'])('restricts %s to their organisation', async role => {
    setProfile(role)
    await expect(getReflectionDataSetDetail('org-b')).rejects.toThrow('falsche Org-ID')
    expect(mocks.responses).not.toHaveBeenCalled()

    await getReflectionDataSets({ organizationId: 'org-b' })
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0])
    expect(query.params).toEqual(['org-a', 'org-b'])
    expect(query.sql).toContain(' and ')

    await expect(getReflectionDataSetDetail('org-a')).resolves.toEqual({ rows: [], organizationName: 'Organisation A' })
    const detailQuery = new PgDialect().sqlToQuery(mocks.responses.mock.calls[0][0].where)
    expect(detailQuery.params).toEqual(['org-a'])
  })

  it('denies a manager without an assigned organisation', async () => {
    setProfile('org_manager', null)
    await expect(getReflectionDataSets()).rejects.toThrow('Keine Organisation zugewiesen')
    await expect(getReflectionDataSetDetail('org-a')).rejects.toThrow('Keine Organisation zugewiesen')
  })

  it.each(['admin', 'super_admin'])('shows %s with a home organisation their own organisation unless another is selected', async role => {
    setProfile(role)
    await getReflectionDataSets()
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual(['org-a'])

    await getReflectionDataSets({ organizationId: 'org-b' })
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[1][0])
    expect(query.params).toEqual(['org-b', 'org-b'])

    await getAllReflectionDataSets({ organizationId: 'org-b' })
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[2][0]).params).toEqual(['org-b'])
  })

  it('reserves the unrestricted list for admins', async () => {
    setProfile('global_view_only', null)
    await expect(getAllReflectionDataSets()).rejects.toThrow('nur Admins')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it.each(['admin', 'super_admin', 'global_view_only'])('allows %s without a home organisation to read and filter across organisations', async role => {
    setProfile(role, null)
    await getReflectionDataSets()
    expect(mocks.where).toHaveBeenLastCalledWith(undefined)

    await getReflectionDataSets({ organizationId: 'org-b' })
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[1][0])
    expect(query.params).toEqual(['org-b', 'org-b'])

    await expect(getReflectionDataSetDetail('org-b')).resolves.toBeDefined()
  })
})

describe('reflection dataset completion', () => {
  it('reports no datasets when no reflection has been saved', async () => {
    await expect(getReflectionDataSets()).resolves.toEqual([])
  })

  it('does not count autosaved empty answers as complete', async () => {
    mocks.orderBy.mockResolvedValue(REFLECTION_QUESTIONS.map(question => answer(question.key)))
    await expect(getReflectionDataSets()).resolves.toEqual([{
      organizationId: 'org-a', organizationName: 'Organisation A',
      responseCount: 0, completeness: 0, lastUpdated: null,
    }])
  })

  it('groups organisations separately and uses the latest response timestamp', async () => {
    setProfile('global_view_only', null)
    mocks.orderBy.mockResolvedValue([
      answer('pb_refl_personal_evaluation', { responseText: 'Erstes Ergebnis', updatedAt: new Date('2026-03-01T12:00:00Z') }),
      answer('pb_refl_ambition_next', { responseText: 'Nächstes Ziel', updatedAt: new Date('2026-04-01T12:00:00Z') }),
      answer('pb_refl_personal_evaluation', { organizationId: 'org-b', organizationName: 'Organisation B' }),
    ])
    const datasets = await getReflectionDataSets()
    expect(datasets).toHaveLength(2)
    expect(datasets[0]).toMatchObject({ organizationId: 'org-a', responseCount: 2, lastUpdated: '2026-04-01T12:00:00.000Z' })
    expect(datasets[0].completeness).toBeGreaterThan(0)
    expect(datasets[0].completeness).toBeLessThan(100)
    expect(datasets[1]).toMatchObject({ organizationId: 'org-b', responseCount: 0, completeness: 0 })
  })

  it('counts follow-up questions only when their parent is answered', async () => {
    const answered = REFLECTION_QUESTIONS.filter(question => !question.dependsOn)
      .map(question => answer(question.key, { responseText: 'Beantwortet' }))
    const before = await (async () => {
      mocks.orderBy.mockResolvedValue(answered)
      return getReflectionDataSets()
    })()

    mocks.orderBy.mockResolvedValue([
      ...answered.filter(row => row.questionKey !== 'org_refl_bio_potential_groups'),
      answer('org_refl_bio_potential_groups', { responseMultiple: ['Gemüse'] }),
    ])
    const after = await getReflectionDataSets()
    expect(after[0].responseCount).toBe(before[0].responseCount)
    expect(after[0].completeness).toBeLessThan(before[0].completeness)
  })

  it('reaches full completion when all visible questions are answered', async () => {
    mocks.orderBy.mockResolvedValue(REFLECTION_QUESTIONS.map(question => answer(question.key, {
      responseText: 'Beantwortet', responseOption: '3', responseMultiple: ['Gemüse'],
    })))
    const [dataset] = await getReflectionDataSets()
    expect(dataset.completeness).toBe(100)
    expect(dataset.responseCount).toBe(REFLECTION_QUESTIONS.length)
  })
})
