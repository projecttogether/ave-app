import { AsyncLocalStorage } from 'node:async_hooks'

// Filters narrow a request's database access; they never establish identity.
export const scopeContext = new AsyncLocalStorage<{
  organizationId: string | null
  subOrganizationId: string | null
}>()

export function withDataScope<T>(scope: { organizationId: string | null; subOrganizationId: string | null },
  work: () => PromiseLike<T>): Promise<T> {
  // Drizzle queries are lazy thenables. Await them before leaving the context.
  return scopeContext.run(scope, async () => await work())
}
