import type { AppRole, UserStatus } from '@/types/auth'
import { canViewAllOrgData, isAdmin, isOrgManager, isOrgViewOnly } from '@/lib/roles'

export interface AccessOrganization { id: string; name: string }
export interface AccessSubOrganization extends AccessOrganization { organizationId: string }
export interface ManagedUser {
    id: string
    name: string | null
    email: string | null
    roles: AppRole[]
    status: UserStatus
    lastLogin: string | null
    createdAt: string | null
    organizationId: string | null
    organizations: { name: string } | null
}
export interface UserAccess {
    roles: AppRole[]
    organizationId: string | null
    subOrganizationIds: string[]
}
export interface UserEditorValue extends UserAccess { name: string | null; email: string }

// Presentation only. Authorization continues to use the existing role helpers and database policies.
export const roleLabels: Record<AppRole, string> = {
    basic_user: 'Benutzer', org_manager: 'Manager', org_view_only: 'View Only',
    global_view_only: 'Global View Only', admin: 'Admin', super_admin: 'Super Admin',
}
export const roleDescriptions: Record<AppRole, string> = {
    basic_user: 'Daten für zugewiesene Unterorganisationen erfassen.',
    org_manager: 'Daten, Unterorganisationen und Teamzugänge der eigenen Organisation verwalten.',
    org_view_only: 'Daten der eigenen Organisation ansehen, ohne sie zu bearbeiten.',
    global_view_only: 'Daten aller Organisationen ansehen, ohne sie zu bearbeiten.',
    admin: 'Benutzer, Organisationen und Plattform-Einstellungen verwalten.',
    super_admin: 'Admin-Rechte sowie Benutzerwechsel und Vergabe der Super-Admin-Rolle.',
}

export function sameIds(a: readonly string[], b: readonly string[]) {
    return a.length === b.length && a.every(id => b.includes(id))
}

/** Send only deliberate changes; preserve existing role combinations and dormant memberships. */
export function getUserChanges(before: UserEditorValue, after: UserEditorValue): Partial<UserEditorValue> {
    const changes: Partial<UserEditorValue> = {}
    if (before.name !== after.name) changes.name = after.name
    if (before.email !== after.email) changes.email = after.email
    if (!sameIds(before.roles, after.roles)) changes.roles = after.roles
    if (before.organizationId !== after.organizationId) changes.organizationId = after.organizationId
    if (before.organizationId !== after.organizationId || !sameIds(before.subOrganizationIds, after.subOrganizationIds)) {
        changes.subOrganizationIds = after.subOrganizationIds
    }
    return changes
}

export function needsAccessReview(before: UserEditorValue, after: UserEditorValue) {
    return !sameIds(before.roles, after.roles) || before.organizationId !== after.organizationId ||
        before.email !== after.email || (before.subOrganizationIds.length > 0 && after.subOrganizationIds.length === 0)
}

export function describeAccess(access: UserAccess, organizations: AccessOrganization[], subOrganizations: AccessSubOrganization[]) {
    const organization = organizations.find(org => org.id === access.organizationId)?.name
    const assigned = subOrganizations.filter(sub => access.subOrganizationIds.includes(sub.id)).map(sub => sub.name)
    if (access.roles.length === 0) return 'Keine Rolle zugewiesen. Es bestehen keine rollenbasierten Zugriffsrechte.'
    if (access.roles.length > 1) return `Rollenkombination: ${access.roles.map(role => roleLabels[role]).join(', ')}. Die Berechtigungen dieser Kombination bleiben unverändert, solange die Rollen nicht geändert werden.`
    if (isAdmin(access.roles)) return `Plattformweite Verwaltung. ${organization ? `Zugeordnete Organisation: ${organization}.` : 'Keine Organisation zugeordnet.'} Die Organisationszuordnung beeinflusst bestehende Dateneingabe- und Exportfunktionen.`
    if (canViewAllOrgData(access.roles)) return 'Lesezugriff auf alle Organisationen. Keine Berechtigung zur Dateneingabe.'
    if (!organization) return 'Keine Organisation zugeordnet. Für den Organisationszugriff fehlt die Zuordnung.'
    if (isOrgManager(access.roles)) return `Kann Daten und alle Unterorganisationen von ${organization} verwalten, einschließlich zukünftiger Unterorganisationen. Darf Benutzer und Organisationsbetrachter einladen, Küchen zuweisen und deren Zugang sperren.`
    if (isOrgViewOnly(access.roles)) return `Kann Daten von ${organization} und allen Unterorganisationen ansehen. Keine Berechtigung zur Dateneingabe.`
    return assigned.length
        ? `Kann Daten für ${assigned.join(', ')} in ${organization} erfassen. Andere Unterorganisationen sind nicht zugewiesen.`
        : `Keine Unterorganisation in ${organization} zugewiesen. Es ist noch kein Zugriff auf Standortdaten eingerichtet.`
}

export function accessScopeLabel(access: UserAccess) {
    if (isAdmin(access.roles)) return 'Plattformverwaltung'
    if (canViewAllOrgData(access.roles)) return 'Alle Organisationen'
    if (isOrgManager(access.roles) || isOrgViewOnly(access.roles)) return access.organizationId ? 'Alle Unterorganisationen' : 'Keine Organisation'
    return access.subOrganizationIds.length ? `${access.subOrganizationIds.length} Unterorganisation${access.subOrganizationIds.length === 1 ? '' : 'en'}` : 'Keine Unterorganisation'
}
