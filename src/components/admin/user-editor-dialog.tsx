'use client'

import { useRef, useState } from 'react'
import type { AppRole } from '@/types/auth'
import { createUser, updateUser } from '@/app/admin/actions'
import { sendInviteEmail } from '@/app/admin/actions/send-invite'
import { describeAccess, getUserChanges, needsAccessReview, roleLabels, type ManagedUser, type UserEditorValue, type UserAccess } from '@/lib/admin/user-access'
import { UserAccessFields, type AccessFieldsProps } from './user-access-fields'
import { UserActionConfirmation } from './user-action-confirmation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'

interface Props extends Pick<AccessFieldsProps, 'organizations' | 'subOrganizations'> {
    user?: ManagedUser
    subOrganizationIds: string[]
    currentUserRoles: AppRole[]
    onClose: () => void
    onSaved: () => void
}

export function UserEditorDialog({ user, subOrganizationIds, currentUserRoles, organizations, subOrganizations, onClose, onSaved }: Props) {
    const [original] = useState<UserEditorValue>(() => ({
        name: user?.name || null, email: user?.email || '', roles: [...(user?.roles || ['basic_user'])],
        organizationId: user?.organizationId || null, subOrganizationIds: [...subOrganizationIds],
    }))
    const [draft, setDraft] = useState<UserEditorValue>(original)
    const [review, setReview] = useState(false)
    const [saving, setSaving] = useState(false)
    const savingRef = useRef(false)
    const [error, setError] = useState<string | null>(null)
    const [sendInvite, setSendInvite] = useState(true)
    const [confirmInvite, setConfirmInvite] = useState(false)
    const { toast } = useToast()
    const changes = getUserChanges(original, draft)
    const dirty = Object.keys(changes).length > 0
    const organizationChanged = !!user && original.organizationId !== draft.organizationId
    const reviewRequired = user ? needsAccessReview(original, draft) : draft.roles.some(role => role !== 'basic_user')

    const save = async () => {
        if (savingRef.current) return
        savingRef.current = true
        setSaving(true)
        setError(null)
        try {
            if (user) {
                await updateUser(user.id, changes)
                toast({ title: 'Benutzer gespeichert', description: `Die Änderungen für ${draft.email} wurden übernommen.` })
            } else {
                const result = await createUser(draft.email, draft.roles, draft.organizationId || undefined, draft.subOrganizationIds)
                let inviteError: string | undefined
                if (sendInvite) {
                    try {
                        const invitation = await sendInviteEmail(result.user.id)
                        if (!invitation.success) inviteError = invitation.error || 'Die Einladung konnte nicht gesendet werden.'
                    } catch {
                        inviteError = 'Die Einladung konnte nicht gesendet werden.'
                    }
                }
                toast({
                    title: inviteError ? 'Benutzer erstellt, Einladung nicht gesendet' : 'Benutzer erstellt',
                    description: inviteError ? `${inviteError} Sie können die Einladung in der Benutzerliste erneut senden.` : sendInvite ? `Einladung an ${draft.email} gesendet.` : 'Es wurde keine Einladung gesendet.',
                    variant: inviteError ? 'destructive' : 'default',
                })
            }
            onSaved()
            onClose()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Die Änderungen konnten nicht gespeichert werden.')
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    const accessCard = (value: UserAccess, title: string) => <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="font-medium">{value.roles.map(role => roleLabels[role]).join(', ') || 'Keine Rolle'}</p>
        <p>{organizations.find(org => org.id === value.organizationId)?.name || 'Keine Organisation'}</p>
        <p className="text-muted-foreground">{describeAccess(value, organizations, subOrganizations)}</p>
        {value.subOrganizationIds.length > 0 && <p className="text-xs">Einzelzuweisungen: {subOrganizations.filter(sub => value.subOrganizationIds.includes(sub.id)).map(sub => sub.name).join(', ')}</p>}
    </div>

    return <Dialog open onOpenChange={open => { if (!open && !savingRef.current) onClose() }}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl" showCloseButton={!saving}
            onInteractOutside={event => { if (dirty || saving) event.preventDefault() }}>
            <DialogHeader className="border-b px-6 py-5 pr-12">
                <DialogTitle>{review ? organizationChanged ? 'Organisation wechseln?' : 'Zugriff bestätigen' : user ? 'Benutzer bearbeiten' : 'Benutzer erstellen'}</DialogTitle>
                <DialogDescription>{review ? `Prüfen Sie die Änderungen für ${draft.email}.` : 'Rolle, Organisation und Unterorganisationen gemeinsam festlegen. Änderungen gelten erst nach dem Speichern.'}</DialogDescription>
            </DialogHeader>
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => {
                event.preventDefault()
                if (saving || confirmInvite || (user && !dirty)) return
                if (!review && reviewRequired) { setError(null); setReview(true) }
                else if (!user && sendInvite) { setError(null); setConfirmInvite(true) }
                else void save()
            }}>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {review ? <div className="space-y-4">
                        {user && accessCard(original, 'Bisher')}
                        {accessCard(draft, 'Nach dem Speichern')}
                        {organizationChanged && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Bisherige Unterorganisations-Zuweisungen werden entfernt und durch die neue Auswahl ersetzt. Vorhandene Berichte bleiben in ihrer bisherigen Organisation.</p>}
                        {changes.roles && user && <p className="text-sm">Die bisherigen Rollen werden durch die oben angezeigte Auswahl ersetzt.</p>}
                        {changes.email && user && <p className="text-sm">Anmelde-Adresse: {original.email} → {draft.email}</p>}
                        {(changes.roles || organizationChanged) && user && <p className="text-sm text-muted-foreground">Bestehende Sitzungen werden beendet. Der Benutzer muss sich erneut anmelden.</p>}
                        {!user && <p className="text-sm">{sendInvite ? `Nach der Erstellung wird eine Einladung an ${draft.email} gesendet.` : 'Es wird keine Einladung gesendet.'}</p>}
                    </div> : <fieldset disabled={saving} className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {user && <div className="space-y-2"><Label htmlFor="user-editor-name">Name</Label><Input id="user-editor-name" value={draft.name || ''} onChange={event => setDraft({ ...draft, name: event.target.value || null })} /></div>}
                            <div className={`space-y-2 ${user ? '' : 'sm:col-span-2'}`}><Label htmlFor="user-editor-email">E-Mail</Label><Input id="user-editor-email" type="email" required value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} />{user && draft.email !== original.email && <p className="text-xs text-muted-foreground">Beim Speichern werden alle Sitzungen beendet, Passkeys entfernt und die bisherige Adresse benachrichtigt.</p>}</div>
                        </div>
                        <UserAccessFields value={draft} original={user ? original : undefined} onChange={access => setDraft({ ...draft, ...access })} currentUserRoles={currentUserRoles} organizations={organizations} subOrganizations={subOrganizations} />
                        {!user && <div className="flex items-center gap-2"><Checkbox id="user-editor-invite" checked={sendInvite} onCheckedChange={checked => setSendInvite(checked === true)} /><Label htmlFor="user-editor-invite" className="font-normal">Einladungs-E-Mail nach dem Erstellen senden</Label></div>}
                    </fieldset>}
                    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter className="items-center border-t bg-card px-6 py-4">
                    <p className="mr-auto text-xs text-muted-foreground">{saving ? 'Wird gespeichert…' : dirty ? 'Noch nicht gespeichert' : user ? 'Keine Änderungen' : 'Neuer Benutzer'}</p>
                    <Button type="button" variant="outline" disabled={saving} onClick={() => { if (review) { setReview(false); setError(null) } else onClose() }}>{review ? 'Zurück' : 'Abbrechen'}</Button>
                    <Button type="submit" disabled={saving || (!!user && !dirty)}>{saving ? 'Wird gespeichert…' : review ? organizationChanged ? 'Organisation wechseln' : user ? 'Änderungen bestätigen' : 'Benutzer erstellen' : user ? 'Änderungen speichern' : reviewRequired ? 'Zugriff prüfen' : 'Benutzer erstellen'}</Button>
                </DialogFooter>
            </form>
        </DialogContent>
        {confirmInvite && <UserActionConfirmation
            title="Benutzer erstellen und Einladung senden?"
            description={`Das Benutzerkonto wird erstellt und eine Einladungs-E-Mail an ${draft.email} gesendet.`}
            confirmLabel="Erstellen und Einladung senden"
            onConfirm={save}
            onClose={() => setConfirmInvite(false)}
        />}
    </Dialog>
}
