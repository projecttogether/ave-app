import { Pool, type PoolClient } from 'pg'

export type DatabaseIdentity = {
  userId: string | null
  organizationId?: string | null
  subOrganizationId?: string | null
}

/** Every query runs with transaction-local identity, including Drizzle transactions. */
export class TenantPool extends Pool {
  constructor(private readonly source: Pool, private readonly identity: () => Promise<DatabaseIdentity>) {
    super()
  }

  connect: Pool['connect'] = (async () => {
    const identity = await this.identity()
    const client = await this.source.connect()
    let transaction = false
    let released = false
    const setIdentity = () => client.query(
      "select set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true), set_config('app.sub_organization_id', $3, true)",
      [identity.userId ?? '', identity.organizationId ?? '', identity.subOrganizationId ?? ''],
    )
    const wrapped = Object.create(client) as PoolClient
    wrapped.query = (async (query: any, values?: any) => {
      if (released) throw new Error('Database connection already released')
      const statement = (typeof query === 'string' ? query : query.text).trim()
      if (/^begin\b/i.test(statement)) {
        if (transaction) throw new Error('Use a savepoint for nested transactions')
        try {
          const result = await client.query(query, values)
          transaction = true
          await setIdentity()
          return result
        } catch (error) {
          // Drizzle starts BEGIN outside its try/finally.
          wrapped.release(true)
          throw error
        }
      }
      if (transaction) {
        const result = await client.query(query, values)
        if (/^(commit|rollback)\b/i.test(statement) && !/^rollback\s+to\b/i.test(statement)) transaction = false
        return result
      }
      await client.query('begin')
      transaction = true
      try {
        await setIdentity()
        const result = await client.query(query, values)
        await client.query('commit')
        transaction = false
        return result
      } catch (error) {
        try { await client.query('rollback'); transaction = false } catch { /* Destroy below. */ }
        throw error
      }
    }) as PoolClient['query']
    wrapped.release = (error?: Error | boolean) => {
      if (released) return
      released = true
      // Never return an open or failed transaction to the shared pool.
      client.release(error || transaction)
    }
    return wrapped
  }) as Pool['connect']

  query: Pool['query'] = (async (query: any, values?: any) => {
    const client = await this.connect()
    try { return await client.query(query, values) } finally { client.release() }
  }) as Pool['query']

  end: Pool['end'] = (() => this.source.end()) as Pool['end']
}
