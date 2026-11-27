// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersPageClient } from '@/components/admin/users-page-client'
import { UserEditorDialog } from '@/components/admin/user-editor-dialog'

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), send: vi.fn(), refresh: vi.fn(), toast: vi.fn(), close: vi.fn(), saved: vi.fn() }))
vi.mock('@/app/admin/actions', () => ({ createUser: actions.create, updateUser: actions.update, deleteUser: vi.fn(), deactivateUser: vi.fn(), activateUser: vi.fn(), bulkUpdateUsers: vi.fn() }))
vi.mock('@/app/admin/actions/send-invite', () => ({ sendInviteEmail: actions.send }))
vi.mock('@/app/actions/impersonate', () => ({ impersonateUser: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: actions.toast }) }))

const users = ['alice', 'bob'].map(id => ({ id, email: `${id}@example.com`, name: null, roles: ['basic_user' as const],
    status: 'active' as const, lastLogin: null, createdAt: null, organizationId: null, organizations: null }))
let container: HTMLDivElement, root: Root
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.resetAllMocks()
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    })
    actions.create.mockResolvedValue({ user: { id: 'new' } })
    actions.send.mockResolvedValue({ success: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
async function mountEditor() {
    await act(async () => root.render(<UserEditorDialog subOrganizationIds={[]} currentUserRoles={['admin']}
        organizations={[]} subOrganizations={[]} onClose={actions.close} onSaved={actions.saved} />))
    await input('new@example.com')
}
async function mountList() {
    await act(async () => root.render(<UsersPageClient initialUsers={users} organizations={[]} currentUserRoles={['admin']}
        subOrganizations={[]} userSubOrgMemberships={[]} />))
}
async function click(text: string) {
    const scope = document.querySelector('[role=alertdialog]') || document
    const button = [...scope.querySelectorAll<HTMLButtonElement>('button, [role=menuitem]')].find(button => button.textContent?.trim() === text)!
    expect(button).toBeDefined()
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        button.click()
    })
}
async function input(value: string) {
    const input = document.querySelector<HTMLInputElement>('#user-editor-email')!
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('admin email confirmation', () => {
    it('keeps the sort button focused while changing the user order', async () => {
        await mountList()
        const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'E-Mail')!
        button.focus()
        await act(async () => button.click())
        expect(document.activeElement).toBe(button)
        await act(async () => button.click())
        expect(document.activeElement).toBe(button)
        const rows = [...container.querySelectorAll('tbody tr')]
        expect(rows[0].textContent).toContain('bob@example.com')
        expect(rows[1].textContent).toContain('alice@example.com')
    })

    it('requires confirmation for account creation with an invitation and preserves the draft after cancel', async () => {
        await mountEditor()
        await click('Benutzer erstellen')
        expect(actions.create).not.toHaveBeenCalled()
        expect(actions.send).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('new@example.com')
        expect(document.activeElement?.textContent).toBe('Abbrechen')
        await click('Abbrechen')
        expect(actions.create).not.toHaveBeenCalled()
        expect(actions.send).not.toHaveBeenCalled()
        expect(document.querySelector<HTMLInputElement>('#user-editor-email')?.value).toBe('new@example.com')
        await click('Benutzer erstellen')
        await click('Erstellen und Einladung senden')
        expect(actions.create).toHaveBeenCalledExactlyOnceWith('new@example.com', ['basic_user'], undefined, [])
        expect(actions.send).toHaveBeenCalledExactlyOnceWith('new')
    })

    it('creates an account without sending mail when the invitation checkbox is cleared', async () => {
        await mountEditor()
        await act(async () => document.querySelector<HTMLButtonElement>('#user-editor-invite')!.click())
        await click('Benutzer erstellen')
        expect(document.querySelector('[role=alertdialog]')).toBeNull()
        expect(actions.create).toHaveBeenCalledOnce()
        expect(actions.send).not.toHaveBeenCalled()
    })

    it('still confirms email sending after reviewing a privileged role', async () => {
        await mountEditor()
        await act(async () => document.querySelector<HTMLInputElement>('input[type=radio][value=org_manager]')!.click())
        await click('Zugriff prüfen')
        expect(actions.create).not.toHaveBeenCalled()
        await click('Benutzer erstellen')
        expect(actions.send).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('new@example.com')
        await click('Erstellen und Einladung senden')
        expect(actions.create).toHaveBeenCalledExactlyOnceWith('new@example.com', ['org_manager'], undefined, [])
        expect(actions.send).toHaveBeenCalledOnce()
    })

    it('opens a confirmation instead of sending when the row action is selected', async () => {
        await mountList()
        await click('Aktionen')
        await click('Einladung senden')
        expect(actions.send).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('alice@example.com')
        await click('Abbrechen')
        expect(actions.send).not.toHaveBeenCalled()
        await click('Aktionen')
        await click('Einladung senden')
        await click('Einladung senden')
        expect(actions.send).toHaveBeenCalledExactlyOnceWith('alice')
    })

    it('keeps a failed row invitation open for review and retry', async () => {
        actions.send.mockResolvedValueOnce({ success: false, error: 'Versand fehlgeschlagen.' })
        await mountList()
        await click('Aktionen')
        await click('Einladung senden')
        await click('Einladung senden')
        expect(document.querySelector('[role=alertdialog] [role=alert]')?.textContent).toBe('Versand fehlgeschlagen.')
        expect(actions.refresh).not.toHaveBeenCalled()
        await click('Einladung senden')
        expect(actions.send).toHaveBeenCalledTimes(2)
        expect(document.querySelector('[role=alertdialog]')).toBeNull()
    })
})
