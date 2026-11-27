import { describe, expect, it } from 'vitest'
import { accessScopeLabel, describeAccess, getUserChanges, needsAccessReview, type UserEditorValue } from '@/lib/admin/user-access'

const before: UserEditorValue = {
    name: 'Example', email: 'example@example.com', roles: ['basic_user', 'org_view_only'],
    organizationId: 'org-a', subOrganizationIds: ['sub-a'],
}
const organizations = [{ id: 'org-a', name: 'Organisation A' }]
const subs = [{ id: 'sub-a', name: 'Standort A', organizationId: 'org-a' }]

describe('user access editor', () => {
    it('leaves role combinations and memberships untouched when only the name changes', () => {
        expect(getUserChanges(before, { ...before, name: 'New name' })).toEqual({ name: 'New name' })
    })
    it('does not rewrite unchanged roles or memberships because their order changed', () => {
        expect(getUserChanges(before, { ...before, roles: ['org_view_only', 'basic_user'] })).toEqual({})
    })
    it('sends a role replacement only when explicitly selected and retains dormant memberships', () => {
        expect(getUserChanges(before, { ...before, roles: ['org_manager'] })).toEqual({ roles: ['org_manager'] })
    })
    it('sends organization removal and the empty membership selection together', () => {
        expect(getUserChanges(before, { ...before, organizationId: null, subOrganizationIds: [] })).toEqual({ organizationId: null, subOrganizationIds: [] })
    })
    it('includes replacement memberships on an organization move, even if both lists are empty', () => {
        const empty = { ...before, subOrganizationIds: [] }
        expect(getUserChanges(empty, { ...empty, organizationId: 'org-b' })).toEqual({ organizationId: 'org-b', subOrganizationIds: [] })
    })
    it('does not require an extra confirmation for a name change or another assigned location', () => {
        expect(needsAccessReview(before, { ...before, name: 'New name' })).toBe(false)
        expect(needsAccessReview(before, { ...before, subOrganizationIds: ['sub-a', 'sub-b'] })).toBe(false)
    })
    it('reviews role changes, organization moves, login email changes and removal of the last location', () => {
        const changes: Partial<UserEditorValue>[] = [{ roles: ['admin'] }, { organizationId: 'org-b' }, { email: 'other@example.com' }, { subOrganizationIds: [] }]
        for (const change of changes) {
            expect(needsAccessReview(before, { ...before, ...change })).toBe(true)
        }
    })
    it('shows inherited scope rather than zero memberships for a manager', () => {
        expect(accessScopeLabel({ ...before, roles: ['org_manager'], subOrganizationIds: [] })).toBe('Alle Unterorganisationen')
        expect(describeAccess({ ...before, roles: ['org_manager'] }, organizations, subs)).toContain('einschließlich zukünftiger')
    })
    it('does not describe a mixed role assignment as simply read-only or editable', () => {
        expect(describeAccess(before, organizations, subs)).toContain('Rollenkombination: Benutzer, View Only')
    })
    it('keeps the admin organization caveat visible and distinguishes global readers', () => {
        expect(describeAccess({ ...before, roles: ['admin'] }, organizations, subs)).toContain('Dateneingabe- und Exportfunktionen')
        expect(describeAccess({ ...before, roles: ['global_view_only'] }, organizations, subs)).toContain('Lesezugriff auf alle Organisationen')
    })
})
