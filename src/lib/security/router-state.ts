import { parseAndValidateFlightRouterState } from 'next/dist/server/app-render/parse-and-validate-flight-router-state'

export function validRouterState(headers: Headers): boolean {
  try {
    // Use the locked Next.js schema, including its size limit and nested segments.
    parseAndValidateFlightRouterState(headers.get('next-router-state-tree') ?? undefined)
    return true
  } catch {
    return false
  }
}
