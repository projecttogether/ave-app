// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({ organization: vi.fn(), responses: vi.fn(), save: vi.fn(), toast: vi.fn() }))
vi.mock('@/app/actions/reflection', () => ({
    getUserOrganization: actions.organization, getReflectionResponses: actions.responses, saveAllReflectionResponses: actions.save,
}))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: actions.toast }) }))
import { ReflectionEntryForm } from '@/components/form/reflection-entry-form'
import { REFLECTION_QUESTIONS } from '@/lib/reflection/constants'

function loaded(text: string) {
    return Object.fromEntries(REFLECTION_QUESTIONS.map(q => [q.key, { text, option: '', multiple: [], date: '' }]))
}
let container: HTMLDivElement, root: Root
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.resetAllMocks()
    actions.organization.mockResolvedValue({ id: 'org', name: 'Catering' })
    actions.responses.mockResolvedValue(loaded('Gespeichert'))
    actions.save.mockResolvedValue({})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
})
afterEach(() => container.remove())

describe('reflection autosave', () => {
    it('does not save loaded answers when leaving without edits', async () => {
        // Responses arrive after the organization has rendered, as on a slow network.
        let resolve!: (data: ReturnType<typeof loaded>) => void
        actions.responses.mockReturnValue(new Promise(r => { resolve = r }))
        await act(async () => root.render(<ReflectionEntryForm />))
        await act(async () => resolve(loaded('Gespeichert')))
        expect(container.querySelector('textarea')).not.toBeNull()
        await act(async () => root.unmount())
        expect(actions.save).not.toHaveBeenCalled()
    })

    it('does not offer blank answers for editing when loading fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        actions.responses.mockRejectedValue(new Error('Zugriff verweigert'))
        await act(async () => root.render(<ReflectionEntryForm />))
        expect(container.textContent).toContain('konnten nicht geladen werden')
        expect(container.querySelector('textarea')).toBeNull()
        await act(async () => root.unmount())
        expect(actions.save).not.toHaveBeenCalled()
    })

    it('saves a pending edit when leaving before the debounce fires', async () => {
        await act(async () => root.render(<ReflectionEntryForm />))
        const textarea = container.querySelector('textarea')!
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Neu')
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await act(async () => root.unmount())
        expect(actions.save).toHaveBeenCalledTimes(1)
        const [organizationId, data] = actions.save.mock.calls[0]
        expect(organizationId).toBe('org')
        expect(Object.values(data).map(v => (v as { text: string }).text)).toContain('Neu')
        expect(Object.values(data).map(v => (v as { text: string }).text)).toContain('Gespeichert')
    })
})
