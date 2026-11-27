import { createHash } from 'node:crypto'
import { FORMULA_POLICY } from './policy'

export const FORMULA_REVISION = `${FORMULA_POLICY.version}:${createHash('sha256').update(JSON.stringify(FORMULA_POLICY)).digest('hex')}`

/** Stable content identity independent of object key order. */
export function stableJson(value: unknown): string {
    if (value === undefined) return 'null'
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (value instanceof Date) return JSON.stringify(value.toISOString())
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

export function inputRevision(value: unknown): string {
    return createHash('sha256').update(stableJson(value)).digest('hex')
}
