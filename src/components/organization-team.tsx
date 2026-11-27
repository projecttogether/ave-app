'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { inviteOrganizationMember, resendOrganizationInvitation, cancelOrganizationInvitation, suspendOrganizationMember, updateOrganizationMemberKitchens } from '@/app/actions/organization-team'
import { isOrdinaryTeamMember, teamInvitationSchema, teamMemberStatus, type TeamActionResult, type TeamInvitation, type TeamMember } from '@/lib/organization-team'
import { roleLabels } from '@/lib/admin/user-access'
import type { AppRole } from '@/types/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserActionConfirmation } from '@/components/admin/user-action-confirmation'

type Kitchen = { id: string; name: string }
type Notice = { text: string; warning: boolean }

function KitchenChoices({ kitchens, selected, onChange }: { kitchens: Kitchen[]; selected: string[]; onChange: (ids: string[]) => void }) {
    return <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Zugewiesene Küchen</legend>
        {kitchens.length ? <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
            {kitchens.map(kitchen => <label key={kitchen.id} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="accent-primary" checked={selected.includes(kitchen.id)}
                    onChange={event => onChange(event.target.checked ? [...selected, kitchen.id] : selected.filter(id => id !== kitchen.id))} />
                {kitchen.name}
            </label>)}
        </div> : <p className="text-sm text-muted-foreground">Erstellen Sie zuerst eine Küche im Tab „Unterorganisationen“.</p>}
        <p className="text-xs text-muted-foreground">Mindestens eine Küche auswählen. Zugriff besteht nur auf die ausgewählten Küchen.</p>
    </fieldset>
}

function TeamMemberDialog({ member, kitchens, organizationName, onClose, onSaved }: {
    member?: TeamMember; kitchens: Kitchen[]; organizationName: string
    onClose: () => void; onSaved: (result: Extract<TeamActionResult, { success: true }>) => void
}) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<TeamInvitation['role']>('basic_user')
    const [selected, setSelected] = useState<string[]>(member?.subOrganizationIds ?? [])
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [invitation, setInvitation] = useState<TeamInvitation | null>(null)
    const submitting = useRef(false)
    async function submit(event: FormEvent) {
        event.preventDefault()
        if (submitting.current || invitation) return
        setError(null)
        const input = { email, role, subOrganizationIds: role === 'basic_user' ? selected : [] }
        if (!member) {
            const parsed = teamInvitationSchema.safeParse(input)
            if (!parsed.success) { setError(parsed.error.issues[0].message); return }
            setInvitation(parsed.data)
            return
        }
        await save()
    }
    async function save(input?: TeamInvitation) {
        if (submitting.current) return
        submitting.current = true
        setPending(true)
        try {
            const result = member ? await updateOrganizationMemberKitchens(member.id, selected) : await inviteOrganizationMember(input!)
            if (!result.success) { setError(result.error); return }
            onSaved(result)
            onClose()
        } catch {
            setError('Die Anfrage konnte nicht abgeschlossen werden. Bitte laden Sie die Teamliste neu, bevor Sie es erneut versuchen.')
        } finally {
            submitting.current = false
            setPending(false)
        }
    }
    return <Dialog open onOpenChange={open => { if (!open && !submitting.current) onClose() }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{member ? 'Küchen zuweisen' : 'Teammitglied einladen'}</DialogTitle>
                <DialogDescription>{member ? member.email : `Zugang zu ${organizationName} einrichten. Die Einladung ist sieben Tage gültig.`}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-5">
                <fieldset disabled={pending} className="space-y-5">
                    {!member && <>
                        <div className="space-y-2"><Label htmlFor="team-invite-email">E-Mail-Adresse</Label>
                            <Input id="team-invite-email" type="email" required maxLength={255} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} />
                            <p className="text-xs text-muted-foreground">Jede E-Mail-Adresse kann nur einmal registriert werden. Bestehende Konten werden nicht in Ihre Organisation übernommen.</p>
                        </div>
                        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Zugriff</legend>
                            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                                <input className="mt-1 accent-primary" type="radio" name="team-role" checked={role === 'basic_user'} onChange={() => setRole('basic_user')} />
                                <span><span className="block font-medium">Datenerfassung</span>Daten für ausgewählte Küchen ansehen und bearbeiten.</span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                                <input className="mt-1 accent-primary" type="radio" name="team-role" checked={role === 'org_view_only'} onChange={() => setRole('org_view_only')} />
                                <span><span className="block font-medium">Organisation ansehen</span>Alle Küchen der Organisation ansehen, ohne Daten zu bearbeiten.</span>
                            </label>
                        </fieldset>
                    </>}
                    {role === 'basic_user' && <KitchenChoices kitchens={kitchens} selected={selected} onChange={setSelected} />}
                    <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
                        {role === 'org_view_only'
                            ? `Lesezugriff auf die gesamte Organisation ${organizationName}, einschließlich aller bestehenden und zukünftigen Küchen.`
                            : `Datenerfassung für ${selected.length ? kitchens.filter(k => selected.includes(k.id)).map(k => k.name).join(', ') : 'noch keine Küche'}.`}
                    </div>
                    {member && <p className="text-xs text-muted-foreground">Bestehende Sitzungen werden beendet. Das Teammitglied meldet sich anschließend erneut an.</p>}
                </fieldset>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Abbrechen</Button>
                    <Button type="submit" disabled={pending || (role === 'basic_user' && selected.length === 0)}>
                        {pending ? 'Wird gespeichert…' : member ? 'Zuweisung speichern' : 'Einladung senden'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
        {invitation && <UserActionConfirmation
            title="Einladung senden?"
            description={`Ein Benutzerkonto wird erstellt und eine Einladungs-E-Mail an ${invitation.email} gesendet.`}
            confirmLabel="Einladung senden"
            onConfirm={() => save(invitation)}
            onClose={() => setInvitation(null)}
        />}
    </Dialog>
}

export function OrganizationTeam({ actorId, members, kitchens, organizationName, loadedAt }: {
    actorId: string; members: TeamMember[]; kitchens: Kitchen[]; organizationName: string; loadedAt: number
}) {
    const router = useRouter()
    const [editor, setEditor] = useState<TeamMember | 'invite' | null>(null)
    const [confirmation, setConfirmation] = useState<{ member: TeamMember; kind: 'cancel' | 'suspend' | 'resend' } | null>(null)
    const [pending, setPending] = useState<string | null>(null)
    const [notice, setNotice] = useState<Notice | null>(null)
    const [query, setQuery] = useState('')
    const submitting = useRef(false)
    function saved(result: Extract<TeamActionResult, { success: true }>, text: string) {
        setNotice({ text: result.warning || text, warning: !!result.warning })
        router.refresh()
    }
    async function resend(member: TeamMember) {
        if (submitting.current) return
        submitting.current = true
        setPending(member.id)
        setNotice(null)
        try {
            const result = await resendOrganizationInvitation(member.id)
            if (result.success) saved(result, `Einladung an ${member.email} gesendet.`)
            else setNotice({ text: result.error, warning: true })
        } catch { setNotice({ text: 'Die Anfrage konnte nicht abgeschlossen werden. Bitte laden Sie die Teamliste neu.', warning: true }) }
        finally { submitting.current = false; setPending(null) }
    }
    const filtered = members.filter(member => `${member.name ?? ''} ${member.email}`.toLowerCase().includes(query.toLowerCase()))
    return <section className="space-y-4" aria-label="Organisationsteam">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">Team</h2><p className="text-sm text-muted-foreground">{members.length} Konten in {organizationName}</p></div>
            <Button disabled={!!pending} onClick={() => { setNotice(null); setEditor('invite') }}><UserPlus className="mr-2 size-4" />Teammitglied einladen</Button>
        </div>
        <p className="text-sm text-muted-foreground">Verwalten Sie Einladungen, Küchenzuweisungen und den Zugang Ihres Teams. Rollenänderungen, Reaktivierungen und Änderungen an E-Mail-Adressen übernimmt AVE.</p>
        {notice && <p role={notice.warning ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm ${notice.warning ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>{notice.text}</p>}
        <Input aria-label="Team durchsuchen" placeholder="Nach Name oder E-Mail suchen" value={query} onChange={event => setQuery(event.target.value)} className="max-w-sm" />
        <div className="rounded-md border"><Table>
            <TableHeader><TableRow><TableHead>Teammitglied</TableHead><TableHead>Zugriff</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map(member => {
                const manageable = isOrdinaryTeamMember(member, actorId)
                const isPending = ['pending', 'invited'].includes(member.status)
                return <TableRow key={member.id}>
                    <TableCell><p className="font-medium">{member.name || member.email}{member.id === actorId ? ' (Sie)' : ''}</p>{member.name && <p className="text-xs text-muted-foreground">{member.email}</p>}</TableCell>
                    <TableCell><p>{member.roles.map(role => roleLabels[role as AppRole] || role).join(', ') || 'Keine Rolle'}</p>
                        <p className="text-xs text-muted-foreground">{member.roles.length === 1 && member.roles[0] === 'basic_user'
                            ? kitchens.filter(k => member.subOrganizationIds.includes(k.id)).map(k => k.name).join(', ') || 'Keine Küche zugewiesen'
                            : member.roles.length === 1 && ['org_manager', 'org_view_only'].includes(member.roles[0]) ? 'Alle Küchen der Organisation' : 'Verwaltung durch AVE'}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline">{teamMemberStatus(member, loadedAt)}</Badge>
                        {isPending && member.invitationExpiresAt && <p className="mt-1 text-xs text-muted-foreground">Gültig bis {new Date(member.invitationExpiresAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</p>}
                    </TableCell>
                    <TableCell className="text-right">{manageable && member.status !== 'deactivated'
                        ? <div className="flex flex-wrap justify-end gap-1">
                            {member.roles[0] === 'basic_user' && <Button size="sm" variant="outline" disabled={!!pending} onClick={() => setEditor(member)}>Küchen zuweisen</Button>}
                            {isPending && <><Button size="sm" variant="outline" disabled={!!pending} onClick={() => setConfirmation({ member, kind: 'resend' })}>{pending === member.id ? 'Wird gesendet…' : 'Erneut senden'}</Button>
                                <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => setConfirmation({ member, kind: 'cancel' })}>Einladung widerrufen</Button></>}
                            {member.status === 'active' && <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => setConfirmation({ member, kind: 'suspend' })}>Zugang sperren</Button>}
                        </div> : <span className="text-xs text-muted-foreground">{member.id === actorId ? 'Eigenes Konto' : 'Verwaltung durch AVE'}</span>}
                    </TableCell>
                </TableRow>
            })}{!filtered.length && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Keine Teammitglieder gefunden.</TableCell></TableRow>}</TableBody>
        </Table></div>
        {editor && <TeamMemberDialog member={editor === 'invite' ? undefined : editor} kitchens={kitchens} organizationName={organizationName}
            onClose={() => setEditor(null)} onSaved={result => saved(result, editor === 'invite' ? 'Einladung gesendet.' : 'Küchenzuweisung gespeichert.')} />}
        {confirmation && <UserActionConfirmation destructive={confirmation.kind !== 'resend'}
            title={confirmation.kind === 'resend' ? 'Einladung erneut senden?' : confirmation.kind === 'cancel' ? 'Einladung widerrufen?' : 'Zugang sperren?'}
            description={confirmation.kind === 'resend' ? `Eine neue Einladungs-E-Mail wird an ${confirmation.member.email} gesendet.` : confirmation.member.email}
            confirmLabel={confirmation.kind === 'resend' ? 'Einladung erneut senden' : confirmation.kind === 'cancel' ? 'Einladung widerrufen' : 'Zugang sperren'}
            onClose={() => setConfirmation(null)} onConfirm={async () => {
                if (confirmation.kind === 'resend') { await resend(confirmation.member); return }
                const result = confirmation.kind === 'cancel' ? await cancelOrganizationInvitation(confirmation.member.id) : await suspendOrganizationMember(confirmation.member.id)
                if (!result.success) throw new Error(result.error)
                saved(result, confirmation.kind === 'cancel' ? 'Einladung widerrufen.' : 'Zugang gesperrt.')
            }}>
            {confirmation.kind !== 'resend' && <p className="text-sm">{confirmation.kind === 'cancel'
                ? 'Das Konto kann sich nicht mehr anmelden. Die E-Mail-Adresse bleibt reserviert. Eine erneute Freigabe übernimmt AVE.'
                : 'Das Teammitglied verliert den Zugang und wird abgemeldet. Erfasste Daten bleiben erhalten. Eine Reaktivierung übernimmt AVE.'}</p>}
        </UserActionConfirmation>}
    </section>
}
