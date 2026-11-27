// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamMember } from '@/lib/organization-team'

const actions = vi.hoisted(() => ({ invite: vi.fn(), resend: vi.fn(), cancel: vi.fn(), suspend: vi.fn(), kitchens: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/actions/organization-team', () => ({
    inviteOrganizationMember: actions.invite, resendOrganizationInvitation: actions.resend,
    cancelOrganizationInvitation: actions.cancel, suspendOrganizationMember: actions.suspend, updateOrganizationMemberKitchens: actions.kitchens,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
import { OrganizationTeam } from '@/components/organization-team'

const kitchen = { id: '11111111-1111-4111-8111-111111111111', name: 'Küche Nord' }
function member(id: string, roles: string[], status: TeamMember['status'] = 'active'): TeamMember {
    return { id, roles, status, email: `${id}@example.com`, name: null, subOrganizationIds: [kitchen.id], invitationExpiresAt: null, invitationSentAt: null }
}
let container: HTMLDivElement, root: Root
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.resetAllMocks()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
async function mount(members: TeamMember[] = []) {
    await act(async () => root.render(<OrganizationTeam actorId="self" members={members} kitchens={[kitchen]} organizationName="Catering" loadedAt={0} />))
}
async function click(text: string) {
    const scope = document.querySelector('[role=alertdialog]') || document
    const button = [...scope.querySelectorAll('button')].find(button => button.textContent === text)!
    expect(button).toBeDefined()
    await act(async () => button.click())
}
async function email(value: string) {
    const input = document.querySelector<HTMLInputElement>('#team-invite-email')!
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('organization team controls', () => {
    it('shows management controls only for ordinary colleagues', async () => {
        await mount([member('self', ['org_manager']), member('manager', ['org_manager']), member('admin', ['admin']),
            member('mixed', ['basic_user','org_view_only']), member('ordinary', ['basic_user']), member('viewer', ['org_view_only'])])
        for (const id of ['self','manager','admin','mixed']) {
            const row = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes(`${id}@example.com`))!
            expect(row.querySelectorAll('button')).toHaveLength(0)
        }
        const ordinary = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('ordinary@example.com'))!
        expect(ordinary.textContent).toContain('Küchen zuweisen')
        expect(ordinary.textContent).toContain('Zugang sperren')
        const viewer = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('viewer@example.com'))!
        expect(viewer.textContent).toContain('Zugang sperren')
        expect(viewer.textContent).not.toContain('Küchen zuweisen')
    })

    it('keeps the invitation form open with its values when the email already exists', async () => {
        actions.invite.mockResolvedValue({ success: false, error: 'Diese E-Mail-Adresse ist bereits registriert.' })
        await mount()
        await click('Teammitglied einladen')
        await email('existing@example.com')
        const send = [...document.querySelectorAll('button')].find(button => button.textContent === 'Einladung senden')!
        expect(send.disabled).toBe(true)
        await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
        await click('Einladung senden')
        expect(actions.invite).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('existing@example.com')
        await click('Einladung senden')
        expect(actions.invite).toHaveBeenCalledWith({ email: 'existing@example.com', role: 'basic_user', subOrganizationIds: [kitchen.id] })
        expect(document.querySelector('[role=alert]')?.textContent).toContain('bereits registriert')
        expect(document.querySelector<HTMLInputElement>('#team-invite-email')?.value).toBe('existing@example.com')
        expect(actions.refresh).not.toHaveBeenCalled()
    })

    it('explains organization-wide viewer access and keeps mail failures visible after account creation', async () => {
        actions.invite.mockResolvedValue({ success: true, warning: 'Einladung gespeichert. Bitte erneut senden.' })
        await mount()
        await click('Teammitglied einladen')
        await email('viewer@example.com')
        await act(async () => document.querySelectorAll<HTMLInputElement>('input[name=team-role]')[1].click())
        expect(document.body.textContent).toContain('einschließlich aller bestehenden und zukünftigen Küchen')
        await click('Einladung senden')
        expect(actions.invite).not.toHaveBeenCalled()
        await click('Einladung senden')
        expect(actions.invite).toHaveBeenCalledWith({ email: 'viewer@example.com', role: 'org_view_only', subOrganizationIds: [] })
        expect(document.querySelector('[role=dialog]')).toBeNull()
        expect(container.querySelector('[role=alert]')?.textContent).toContain('Bitte erneut senden')
        expect(actions.refresh).toHaveBeenCalledOnce()
    })

    it('cancels a new invitation without creating an account or sending email', async () => {
        await mount()
        await click('Teammitglied einladen')
        await email('new@example.com')
        await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
        await click('Einladung senden')
        expect(document.activeElement?.textContent).toBe('Abbrechen')
        await click('Abbrechen')
        expect(actions.invite).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')).toBeNull()
        expect(document.querySelector<HTMLInputElement>('#team-invite-email')?.value).toBe('new@example.com')
    })

    it('requires confirmation before resending and does not resend after Escape', async () => {
        actions.resend.mockResolvedValue({ success: true })
        await mount([member('invited', ['basic_user'], 'invited')])
        await click('Erneut senden')
        expect(actions.resend).not.toHaveBeenCalled()
        expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('invited@example.com')
        await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
        expect(document.querySelector('[role=alertdialog]')).toBeNull()
        expect(actions.resend).not.toHaveBeenCalled()
        await click('Erneut senden')
        await click('Einladung erneut senden')
        expect(actions.resend).toHaveBeenCalledExactlyOnceWith('invited')
    })

    it('disables confirmation while sending to prevent duplicate invitations', async () => {
        let finish!: (result: { success: true }) => void
        actions.invite.mockReturnValue(new Promise(resolve => { finish = resolve }))
        await mount()
        await click('Teammitglied einladen')
        await email('new@example.com')
        await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
        await click('Einladung senden')
        const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role=alertdialog] button')].find(button => button.textContent === 'Einladung senden')!
        await act(async () => { confirm.click(); confirm.click() })
        expect(actions.invite).toHaveBeenCalledOnce()
        expect(confirm.disabled).toBe(true)
        expect(document.querySelector<HTMLButtonElement>('[data-slot=alert-dialog-cancel]')?.disabled).toBe(true)
        await act(async () => finish({ success: true }))
        expect(document.querySelector('[role=alertdialog]')).toBeNull()
    })
})
