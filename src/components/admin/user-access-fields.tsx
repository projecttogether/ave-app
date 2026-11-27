'use client'

import { useId } from 'react'
import type { AppRole } from '@/types/auth'
import { isAdmin, isSubOrganizationScoped } from '@/lib/roles'
import { describeAccess, roleDescriptions, roleLabels, sameIds, type AccessOrganization, type AccessSubOrganization, type UserAccess } from '@/lib/admin/user-access'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface AccessFieldsProps {
    value: UserAccess
    onChange: (value: UserAccess) => void
    original?: UserAccess
    organizations: AccessOrganization[]
    subOrganizations: AccessSubOrganization[]
    currentUserRoles: AppRole[]
}

export function AccessSummary({ value, organizations, subOrganizations }: Pick<AccessFieldsProps, 'value' | 'organizations' | 'subOrganizations'>) {
    return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" aria-live="polite">
        <p className="mb-1 font-medium">Zugriff nach dem Speichern</p>
        <p>{describeAccess(value, organizations, subOrganizations)}</p>
    </div>
}

export function UserAccessFields({ value, onChange, original, organizations, subOrganizations, currentUserRoles }: AccessFieldsProps) {
    const id = useId()
    const available = subOrganizations.filter(sub => sub.organizationId === value.organizationId)
    const keepExisting = original && original.roles.length !== 1
    const showMemberships = isSubOrganizationScoped(value.roles)
    const changedOrganization = original && original.organizationId !== value.organizationId
    const roleOption = (role: AppRole) => <label key={role} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input type="radio" name={`${id}-role`} className="mt-1 accent-primary" value={role}
            checked={value.roles.length === 1 && value.roles[0] === role} onChange={() => onChange({ ...value, roles: [role] })} />
        <span><span className="block text-sm font-medium">{roleLabels[role]}</span><span className="block text-xs text-muted-foreground">{roleDescriptions[role]}</span></span>
    </label>

    return <div className="space-y-5">
        <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Rolle</legend>
            <p className="text-xs text-muted-foreground">Wählen Sie eine Rolle. Die Beschreibung zeigt, wofür sie gedacht ist.</p>
            {keepExisting && <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 has-[:checked]:border-primary">
                <input type="radio" name={`${id}-role`} className="mt-1 accent-primary" checked={sameIds(value.roles, original.roles)} onChange={() => onChange({ ...value, roles: [...original.roles] })} />
                <span className="text-sm"><span className="block font-medium">Bestehende Rollen beibehalten</span>
                    <span className="text-xs text-muted-foreground">{original.roles.map(role => roleLabels[role]).join(', ') || 'Keine Rolle zugewiesen'}. Keine automatische Umstellung.</span></span>
            </label>}
            {(['basic_user', 'org_manager', 'org_view_only'] as const).map(roleOption)}
            <details open={value.roles.some(role => ['global_view_only', 'admin', 'super_admin'].includes(role)) || undefined} className="pt-1">
                <summary className="cursor-pointer text-sm font-medium">Plattformrollen</summary>
                <div className="mt-2 space-y-2">
                    {roleOption('global_view_only')}{roleOption('admin')}
                    {currentUserRoles.includes('super_admin') && roleOption('super_admin')}
                </div>
            </details>
        </fieldset>
        <div className="space-y-2">
            <Label htmlFor={`${id}-organization`}>Organisation</Label>
            <Select value={value.organizationId || 'none'} onValueChange={organizationId => onChange({ ...value, organizationId: organizationId === 'none' ? null : organizationId, subOrganizationIds: [] })}>
                <SelectTrigger id={`${id}-organization`} className="w-full bg-card"><SelectValue placeholder="Organisation wählen" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Keine Organisation</SelectItem>{organizations.map(org => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectContent>
            </Select>
            {isAdmin(value.roles) && <p className="text-xs text-muted-foreground">Die Plattformverwaltung ist organisationsübergreifend. Die Zuordnung bleibt für bestehende Dateneingabe- und Exportfunktionen relevant.</p>}
            {value.roles.includes('global_view_only') && !isAdmin(value.roles) && <p className="text-xs text-muted-foreground">Diese Zuordnung begrenzt die globalen Leserechte nicht.</p>}
            {changedOrganization && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Beim Speichern werden die bisherigen Unterorganisations-Zuweisungen entfernt. Wählen Sie bei Bedarf neue Zuweisungen aus.</p>}
        </div>
        {showMemberships ? <fieldset className="space-y-2 border-l-2 pl-4">
            <legend className="mb-2 text-sm font-medium">Unterorganisationen</legend>
            {available.length ? <><p className="text-xs text-muted-foreground">{value.subOrganizationIds.length} ausgewählt</p><div className="max-h-48 space-y-1 overflow-y-auto">
                {available.map(sub => <label key={sub.id} className="flex cursor-pointer items-center gap-3 rounded-md py-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={value.subOrganizationIds.includes(sub.id)} onChange={event => onChange({ ...value, subOrganizationIds: event.target.checked ? [...value.subOrganizationIds, sub.id] : value.subOrganizationIds.filter(existing => existing !== sub.id) })} />{sub.name}
                </label>)}
            </div></> : <p className="text-sm text-muted-foreground">{value.organizationId ? 'Diese Organisation hat noch keine Unterorganisationen.' : 'Wählen Sie zuerst eine Organisation.'}</p>}
            {!value.subOrganizationIds.length && <p className="text-xs text-amber-800">Ohne Zuweisung besteht kein Zugriff auf Standortdaten.</p>}
        </fieldset> : <div className="rounded-lg border bg-card p-3 text-sm">
            {value.roles.some(role => ['admin', 'super_admin', 'global_view_only'].includes(role)) ? 'Der Zugriff richtet sich nach den Plattformrollen.' : value.roles.length ? 'Der Zugriff umfasst die gesamte zugeordnete Organisation, einschließlich zukünftiger Unterorganisationen.' : 'Wählen Sie eine Rolle, um den Zugriff festzulegen.'}
            {value.subOrganizationIds.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{value.subOrganizationIds.length} bestehende Einzelzuweisungen bleiben gespeichert.</p>}
        </div>}
        <AccessSummary value={value} organizations={organizations} subOrganizations={subOrganizations} />
    </div>
}
