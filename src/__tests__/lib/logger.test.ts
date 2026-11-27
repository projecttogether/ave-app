import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '@/lib/logger'

describe('Structured logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('outputs JSON for info level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('test message')
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output.level).toBe('info')
    expect(output.message).toBe('test message')
    expect(output.service).toBe('ave-dashboard')
    expect(output.timestamp).toBeTruthy()
  })

  it('outputs JSON for error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('error message', { code: 500 })
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output.level).toBe('error')
    expect(output.metadata.code).toBe(500)
  })

  it('outputs JSON for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('warning')
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output.level).toBe('warn')
  })

  it('outputs JSON for security level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.security('security event', { ip: '1.2.3.4' })
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output.level).toBe('security')
    expect(output.metadata.ip).toBe('1.2.3.4')
  })

  it('omits metadata key when not provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('no meta')
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output.metadata).toBeUndefined()
  })
})
