// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ pending: false, otp: false }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useActionState: (action: unknown) => [
    action === 'requestOtp' && state.otp ? { success: true, email: 'test@example.invalid' } : undefined,
    vi.fn(), state.pending,
  ],
}))
vi.mock('@/app/actions/auth', () => ({ requestOtp: 'requestOtp', verifyOtp: 'verifyOtp' }))
vi.mock('next-auth/webauthn', () => ({ signIn: vi.fn() }))
import LoginClient from '@/app/(auth)/login/login-client'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.pending = false; state.otp = false
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

it.each([false, true])('keeps translated login button text attached during pending transitions, OTP=%s', async (otp) => {
  state.otp = otp
  state.pending = true
  await act(async () => root.render(<LoginClient callbackUrl="/dashboard" />))
  const button = container.querySelector('button[type="submit"]')!
  // Browser translation replaces a text node with its own element.
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
  const text = walker.nextNode()!
  const translated = document.createElement('font')
  translated.textContent = text.textContent
  text.parentNode!.replaceChild(translated, text)

  state.pending = false
  await act(async () => root.render(<LoginClient callbackUrl="/dashboard" />))
  expect(button.textContent).toBe(otp ? 'Anmelden' : 'Anmeldecode senden')
  state.pending = true
  await act(async () => root.render(<LoginClient callbackUrl="/dashboard" />))
  expect(button.textContent).toBe(otp ? 'Wird angemeldet...' : 'Wird gesendet...')
  expect(button.querySelector('svg')).not.toBeNull()
})
