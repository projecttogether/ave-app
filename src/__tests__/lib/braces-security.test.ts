import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const loadPackage = createRequire(import.meta.url)
const braces = loadPackage('braces')

describe('installed braces security patch', () => {
  it('uses the patched dependency for micromatch', () => {
    const fromMicromatch = createRequire(loadPackage.resolve('micromatch'))
    expect(fromMicromatch('braces')).toBe(braces)
    expect(loadPackage('braces/package.json').version).toBe('3.0.3-patched.1')
  })

  it.each(['{', '('])('rejects deeply nested %s patterns before stack exhaustion', opening => {
    const closing = opening === '{' ? '}' : ')'
    const pattern = opening.repeat(4000) + 'x' + closing.repeat(4000)
    for (const operation of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      expect(() => operation(pattern)).toThrow(SyntaxError)
      expect(() => operation(pattern)).toThrow('maximum nesting depth')
    }
  })

  it('rejects deep AST inputs passed directly to recursive walkers', () => {
    type Node = { type: string; value?: string; nodes?: Node[] }
    const nested = (): Node => {
      let node: Node = { type: 'text', value: 'x' }
      for (let i = 0; i < 4000; i++) node = { type: 'root', nodes: [node] }
      return node
    }
    for (const operation of [braces.compile, braces.expand, braces.stringify]) {
      expect(() => operation(nested())).toThrow('maximum nesting depth')
    }
  })

  it('keeps ordinary glob alternatives, nesting, and ranges', () => {
    expect(braces('src/**/*.{ts,tsx}')).toEqual(['src/**/*.(ts|tsx)'])
    expect(braces.expand('a/{b,{c,d}}/{1..2}')).toEqual([
      'a/b/1', 'a/b/2', 'a/c/1', 'a/c/2', 'a/d/1', 'a/d/2',
    ])
    expect(braces.stringify(braces.parse('src/**/*.{ts,tsx}'))).toBe('src/**/*.{ts,tsx}')
    expect(() => braces.expand('{1..10000}')).toThrow('range limit')
  })

  it('does not count escaped braces as nesting', () => {
    const pattern = String.raw`\{`.repeat(1000)
    expect(braces.stringify(pattern)).toBe('{'.repeat(1000))
  })
})
