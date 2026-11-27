import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORMULA_REVISION } from '@/lib/indicators/revision'

const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }))
vi.mock('pg', () => ({ Pool: class { query = mocks.query; end = mocks.end } }))

import { verifyDatabaseIsolation } from '@/lib/db/verify-isolation'

const roles = ['ave_app', 'ave_auth', 'ave_policy', 'ave_team'].map(rolname => ({ rolname }))
const safeRole = { allowed: true, rolsuper: false, rolbypassrls: false, rolcreaterole: false,
  can_create: false, policy_owner: false, team_owner: false, other_role: false, owns_tables: false }

describe('database startup diagnostics', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://web:secret@localhost/app')
    vi.stubEnv('AUTH_DATABASE_URL', 'postgresql://auth:secret@localhost/app')
    mocks.query.mockReset()
    mocks.end.mockReset()
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT rolname')) return { rows: roles }
      if (sql.includes('SELECT r.rolsuper')) return { rows: [safeRole] }
      if (sql.includes('AS protected')) return { rows: [{ protected: true, safe_functions: true, benchmark: true, team_functions: true, unique_email: true }] }
      if (sql.includes('AS installed')) return { rows: [{ installed: true }] }
      return { rows: [{ revision: FORMULA_REVISION }] }
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['DATABASE_URL', 'AUTH_DATABASE_URL'])('names a missing %s before connecting', async name => {
    vi.stubEnv(name, '')
    await expect(verifyDatabaseIsolation()).rejects.toThrow(`${name} is required`)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it.each([{ installed: [] }, { installed: roles.slice(0, 2) }])('explains missing migration roles before checking membership', async ({ installed }) => {
    mocks.query.mockResolvedValueOnce({ rows: installed })
    await expect(verifyDatabaseIsolation()).rejects.toThrow(/missing roles .*ave_policy.*automatic database setup/)
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  it('continues to reject privileged connections after migrations', async () => {
    mocks.query.mockResolvedValueOnce({ rows: roles }).mockResolvedValueOnce({ rows: [{ ...safeRole, rolsuper: true }] })
    await expect(verifyDatabaseIsolation()).rejects.toThrow('Unsafe database privileges for DATABASE_URL')
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  it('rejects runtime membership in the team function owner', async () => {
    mocks.query.mockResolvedValueOnce({ rows: roles }).mockResolvedValueOnce({ rows: [{ ...safeRole, team_owner: true }] })
    await expect(verifyDatabaseIsolation()).rejects.toThrow('Unsafe database privileges')
  })

  it('explains incomplete policies before calling missing formula functions', async () => {
    mocks.query.mockResolvedValueOnce({ rows: roles }).mockResolvedValueOnce({ rows: [safeRole] })
      .mockResolvedValueOnce({ rows: [{ protected: false, safe_functions: true, benchmark: true }] })
    await expect(verifyDatabaseIsolation()).rejects.toThrow('Tenant isolation migration is missing or incomplete')
    expect(mocks.query).toHaveBeenCalledTimes(3)
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  it('explains missing formula migrations', async () => {
    mocks.query.mockResolvedValueOnce({ rows: roles }).mockResolvedValueOnce({ rows: [safeRole] })
      .mockResolvedValueOnce({ rows: [{ protected: true, safe_functions: true, benchmark: true, team_functions: true, unique_email: true }] })
      .mockResolvedValueOnce({ rows: [{ installed: false }] })
    await expect(verifyDatabaseIsolation()).rejects.toThrow('Formula migrations are missing for DATABASE_URL')
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  it('validates both connections and closes both pools', async () => {
    await expect(verifyDatabaseIsolation()).resolves.toBeUndefined()
    expect(mocks.end).toHaveBeenCalledTimes(2)
  })
  it('requires the team functions and normalized email constraint before serving requests', async () => {
    mocks.query.mockResolvedValueOnce({ rows: roles }).mockResolvedValueOnce({ rows: [safeRole] })
      .mockResolvedValueOnce({ rows: [{ protected: true, safe_functions: true, benchmark: true, team_functions: true, unique_email: false }] })
    await expect(verifyDatabaseIsolation()).rejects.toThrow('Organization team migration')
  })
})
