'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppRole, UserStatus, Organization } from '@/types/auth'
import {
    deleteUser,
    deactivateUser, activateUser, bulkUpdateUsers
} from '@/app/admin/actions'
import { sendInviteEmail } from '@/app/admin/actions/send-invite'
import { impersonateUser } from '@/app/actions/impersonate'
import { UserEditorDialog } from './user-editor-dialog'
import { UserActionConfirmation } from './user-action-confirmation'
import { accessScopeLabel, roleLabels } from '@/lib/admin/user-access'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import {
    MoreHorizontal, UserCog, Trash2, Search, Plus, Pencil, X,
    ShieldOff, ShieldCheck, ChevronLeft, ChevronRight, SlidersHorizontal, Mail,
    ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'

// --- Types ---

interface SubOrgInfo {
    id: string
    name: string
    organizationId: string
    organizationName: string
    createdAt?: string | null
}

interface SubOrgMembership {
    userId: string
    subOrganizationId: string
}

interface UserData {
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

interface OrganizationWithStringDates extends Omit<Organization, 'createdAt'> {
    createdAt: string | null;
}

interface UsersPageClientProps {
    initialUsers: UserData[]
    organizations: OrganizationWithStringDates[]
    currentUserRoles: AppRole[]
    subOrganizations: SubOrgInfo[]
    userSubOrgMemberships: SubOrgMembership[]
}

// --- Helpers ---

const statusLabels: Record<UserStatus, string> = {
    active: 'Aktiv',
    pending: 'Ausstehend',
    invited: 'Eingeladen',
    deactivated: 'Deaktiviert',
}

const statusColors: Record<UserStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-blue-50 text-blue-700 border-blue-200',
    invited: 'bg-amber-50 text-amber-700 border-amber-200',
    deactivated: 'bg-red-50 text-red-700 border-red-200',
}

function formatRelativeDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Gerade eben'
    if (diffMins < 60) return `vor ${diffMins} Min.`
    if (diffHours < 24) return `vor ${diffHours} Std.`
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getInitials(name: string | null, email: string | null): string {
    if (name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (email) return email[0].toUpperCase()
    return '?'
}

// --- Main Component ---

export function UsersPageClient({
    initialUsers,
    organizations,
    currentUserRoles,
    subOrganizations,
    userSubOrgMemberships,
}: UsersPageClientProps) {
    const [users, setUsers] = useState(initialUsers)
    const [memberships, setMemberships] = useState(userSubOrgMemberships)
    const router = useRouter()
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        setUsers(initialUsers)
    }, [initialUsers])

    useEffect(() => {
        setMemberships(userSubOrgMemberships)
    }, [userSubOrgMemberships])

    // Search & filters
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterRole, setFilterRole] = useState<string>('all')
    const [filterOrg, setFilterOrg] = useState<string>('all')

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchSearch = !search ||
                (u.name?.toLowerCase().includes(search.toLowerCase())) ||
                (u.email?.toLowerCase().includes(search.toLowerCase()))
            const matchStatus = filterStatus === 'all' || u.status === filterStatus
            const matchRole = filterRole === 'all' || u.roles.includes(filterRole as AppRole)
            const matchOrg = filterOrg === 'all' || u.organizationId === filterOrg
            return matchSearch && matchStatus && matchRole && matchOrg
        })
    }, [users, search, filterStatus, filterRole, filterOrg])

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Benutzer</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Verwalten Sie alle Benutzer der Plattform.
                    </p>
                </div>
                <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Benutzer erstellen</Button>
                {creating && <UserEditorDialog subOrganizationIds={[]} organizations={organizations} currentUserRoles={currentUserRoles} subOrganizations={subOrganizations} onClose={() => setCreating(false)} onSaved={() => router.refresh()} />}
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Benutzer suchen..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle Status</SelectItem>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="pending">Ausstehend</SelectItem>
                        <SelectItem value="invited">Eingeladen</SelectItem>
                        <SelectItem value="deactivated">Deaktiviert</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="w-[160px]">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        <SelectValue placeholder="Rolle" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle Rollen</SelectItem>
                        <SelectItem value="basic_user">Basic User</SelectItem>
                        <SelectItem value="org_manager">Org Manager</SelectItem>
                        <SelectItem value="org_view_only">Org View Only</SelectItem>
                        <SelectItem value="global_view_only">Global View Only</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {currentUserRoles.includes('super_admin') && (
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                        )}
                    </SelectContent>
                </Select>
                <Select value={filterOrg} onValueChange={setFilterOrg}>
                    <SelectTrigger className="w-[220px]">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        <SelectValue placeholder="Organisation" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Alle Organisationen</SelectItem>
                        {organizations.map(org => (
                            <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(search || filterStatus !== 'all' || filterRole !== 'all' || filterOrg !== 'all') && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSearch(''); setFilterStatus('all'); setFilterRole('all'); setFilterOrg('all') }}
                        className="text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5 mr-1" /> Zurücksetzen
                    </Button>
                )}
            </div>

            <UserTableSection
                title="Benutzer"
                description={`${filteredUsers.length} Benutzer`}
                users={filteredUsers}
                organizations={organizations}
                subOrganizations={subOrganizations}
                memberships={memberships}
                currentUserRoles={currentUserRoles}
                setUsers={setUsers}
                setMemberships={setMemberships}
                allUsers={users}
            />
        </div>
    )
}

// --- User Table Section ---

function UserTableSection({
    title,
    description,
    users: tableUsers,
    organizations,
    subOrganizations,
    memberships,
    currentUserRoles,
    setUsers,
    setMemberships,
    allUsers,
}: {
    title: string
    description: string
    users: UserData[]
    organizations: OrganizationWithStringDates[]
    subOrganizations: SubOrgInfo[]
    memberships: SubOrgMembership[]
    currentUserRoles: AppRole[]
    setUsers: React.Dispatch<React.SetStateAction<UserData[]>>
    setMemberships: React.Dispatch<React.SetStateAction<SubOrgMembership[]>>
    allUsers: UserData[]
}) {
    const isSuperAdmin = currentUserRoles.includes('super_admin')
    const canEditUser = (u: UserData) => isSuperAdmin || !u.roles.includes('super_admin')
    const router = useRouter()
    const { toast } = useToast()
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [editingUser, setEditingUser] = useState<UserData | null>(null)
    const [accountAction, setAccountAction] = useState<{ kind: 'delete' | 'activate' | 'deactivate'; user: UserData } | null>(null)
    const [impersonating, setImpersonating] = useState<string | null>(null)
    const [inviteRecipient, setInviteRecipient] = useState<UserData | null>(null)

    // Sorting
    type SortKey = 'email' | 'role' | 'lastLogin' | 'status' | 'organization'
    const [sortKey, setSortKey] = useState<SortKey | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('asc')
        }
    }

    const sortedUsers = useMemo(() => {
        if (!sortKey) return tableUsers
        const dir = sortDir === 'asc' ? 1 : -1
        const valueOf = (u: UserData): string => {
            switch (sortKey) {
                case 'email': return (u.email || '').toLowerCase()
                case 'role': return u.roles[0] || ''
                case 'lastLogin': return u.lastLogin || ''
                case 'status': return u.status
                case 'organization': return (u.organizations?.name || '').toLowerCase()
            }
        }
        return [...tableUsers].sort((a, b) => {
            const av = valueOf(a)
            const bv = valueOf(b)
            if (av < bv) return -1 * dir
            if (av > bv) return 1 * dir
            return 0
        })
    }, [tableUsers, sortKey, sortDir])

    // Pagination
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(25)
    const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize))
    useEffect(() => { setPage(0); setSelectedIds(new Set()) }, [pageSize, sortKey, sortDir, tableUsers])
    const pagedUsers = sortedUsers.slice(page * pageSize, (page + 1) * pageSize)

    // Bulk edit state
    const [bulkAction, setBulkAction] = useState<string>('')
    const [bulkValue, setBulkValue] = useState<string>('')
    const [bulkLoading, setBulkLoading] = useState(false)
    const [bulkReview, setBulkReview] = useState<{ action: string; value: string; users: UserData[] } | null>(null)

    const bulkEligible = pagedUsers.filter(canEditUser)
    const allSelected = bulkEligible.length > 0 && bulkEligible.every(u => selectedIds.has(u.id))

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(bulkEligible.map(u => u.id)))
        }
    }

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const renderSortHeader = (label: string, key: SortKey) => {
        const active = sortKey === key
        const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
        return (
            <button
                type="button"
                onClick={() => toggleSort(key)}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
                {label}
                <Icon className={`h-3 w-3 ${active ? 'text-foreground' : 'text-muted-foreground/60'}`} />
            </button>
        )
    }

    const handleAccountAction = async () => {
        if (!accountAction) return
        const { kind, user } = accountAction
        if (kind === 'delete') {
            await deleteUser(user.id)
            setUsers(prev => prev.filter(u => u.id !== user.id))
            setMemberships(prev => prev.filter(m => m.userId !== user.id))
        } else {
            if (kind === 'deactivate') await deactivateUser(user.id)
            else await activateUser(user.id)
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: kind === 'deactivate' ? 'deactivated' : 'active' } : u))
        }
        toast({ title: kind === 'delete' ? 'Benutzer gelöscht' : kind === 'deactivate' ? 'Benutzer deaktiviert' : 'Benutzer aktiviert', description: user.email || undefined })
        router.refresh()
    }

    // --- Bulk ---
    const handleBulkAction = async () => {
        if (!bulkReview) return
        const bulkAction = bulkReview.action
        const bulkValue = bulkReview.value
        setBulkLoading(true)
        try {
            const ids = bulkReview.users.map(user => user.id)
            if (bulkAction === 'role' && bulkValue) {
                const newRoles = [bulkValue as AppRole]
                await bulkUpdateUsers(ids, { roles: newRoles })
                setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, roles: newRoles } : u))
            } else if (bulkAction === 'organization' && bulkValue) {
                const orgId = bulkValue === 'none' ? null : bulkValue
                await bulkUpdateUsers(ids, { organizationId: orgId })
                const orgName = organizations.find(o => o.id === orgId)?.name
                const movedIds = bulkReview.users.filter(user => user.organizationId !== orgId).map(user => user.id)
                setMemberships(prev => prev.filter(m => !movedIds.includes(m.userId)))
                setUsers(prev => prev.map(u => ids.includes(u.id) ? {
                    ...u,
                    organizationId: orgId,
                    organizations: orgName ? { name: orgName } : null,
                } : u))
            } else if (bulkAction === 'deactivate') {
                await bulkUpdateUsers(ids, { status: 'deactivated' })
                setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, status: 'deactivated' as UserStatus } : u))
            } else if (bulkAction === 'activate') {
                await bulkUpdateUsers(ids, { status: 'active' })
                setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, status: 'active' as UserStatus } : u))
            } else if (bulkAction === 'invite') {
                const results = await Promise.allSettled(ids.map(id => sendInviteEmail(id)))
                const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length
                const failed = ids.length - succeeded
                toast({
                    title: `${succeeded} Einladung${succeeded !== 1 ? 'en' : ''} gesendet`,
                    description: failed > 0 ? `${failed} fehlgeschlagen` : undefined,
                    variant: failed > 0 ? 'destructive' : 'default',
                })
            }
            if (bulkAction !== 'invite') toast({ title: 'Änderungen gespeichert', description: `${ids.length} Benutzer wurden aktualisiert.` })
            setSelectedIds(new Set())
            setBulkAction('')
            setBulkValue('')
            router.refresh()
        } finally {
            setBulkLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>

            {/* Bulk Edit Bar */}
            {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                    <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
                    <Select value={bulkAction} onValueChange={v => { setBulkAction(v); setBulkValue('') }}>
                        <SelectTrigger className="w-[160px] h-8">
                            <SelectValue placeholder="Aktion wählen" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="role">Rolle ändern</SelectItem>
                            <SelectItem value="organization">Organisation ändern</SelectItem>
                            <SelectItem value="invite">Einladung senden</SelectItem>
                            <SelectItem value="activate">Aktivieren</SelectItem>
                            <SelectItem value="deactivate">Deaktivieren</SelectItem>
                        </SelectContent>
                    </Select>
                    {bulkAction === 'role' && (
                        <Select value={bulkValue} onValueChange={setBulkValue}>
                            <SelectTrigger className="w-[160px] h-8">
                                <SelectValue placeholder="Rolle wählen" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="org_manager">Manager</SelectItem>
                                <SelectItem value="basic_user">Benutzer</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    {bulkAction === 'organization' && (
                        <Select value={bulkValue} onValueChange={setBulkValue}>
                            <SelectTrigger className="w-[160px] h-8">
                                <SelectValue placeholder="Org. wählen" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Keine</SelectItem>
                                {organizations.map(org => (
                                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button
                        size="sm"
                        onClick={() => setBulkReview({ action: bulkAction, value: bulkValue, users: allUsers.filter(user => selectedIds.has(user.id) && canEditUser(user)) })}
                        disabled={bulkLoading || (!bulkValue && !['deactivate', 'activate', 'invite'].includes(bulkAction))}
                    >
                        {bulkLoading ? 'Wird ausgeführt...' : 'Änderungen prüfen'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSelectedIds(new Set()); setBulkAction(''); setBulkValue('') }}
                    >
                        Abbrechen
                    </Button>
                </div>
            )}

            {/* Table */}
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30">
                            <TableHead className="w-[40px]">
                                <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={toggleAll}
                                    aria-label="Alle auswählen"
                                />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>{renderSortHeader('E-Mail', 'email')}</TableHead>
                            <TableHead>{renderSortHeader('Organisation', 'organization')}</TableHead>
                            <TableHead>Zugriff</TableHead>
                            <TableHead>{renderSortHeader('Rolle', 'role')}</TableHead>
                            <TableHead>{renderSortHeader('Letzter Login', 'lastLogin')}</TableHead>
                            <TableHead>{renderSortHeader('Status', 'status')}</TableHead>
                            <TableHead className="text-right w-[60px]">Aktionen</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                    Keine Benutzer gefunden.
                                </TableCell>
                            </TableRow>
                        ) : (
                            pagedUsers.map(user => {
                                const userMembershipIds = memberships
                                    .filter(m => m.userId === user.id)
                                    .map(m => m.subOrganizationId)

                                return (
                                    <TableRow key={user.id}>
                                        {/* Checkbox */}
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedIds.has(user.id)}
                                                onCheckedChange={() => toggleOne(user.id)}
                                                disabled={!canEditUser(user)}
                                                aria-label={`${user.email} auswählen`}
                                            />
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{getInitials(user.name, user.email)}</div>
                                                <span className="text-sm font-medium">{user.name || '—'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell><span className="text-sm text-muted-foreground">{user.email}</span></TableCell>
                                        <TableCell><span className="text-sm">{user.organizations?.name || 'Keine Organisation'}</span></TableCell>
                                        <TableCell>
                                            <p className="text-sm">{accessScopeLabel({ roles: user.roles, organizationId: user.organizationId, subOrganizationIds: userMembershipIds })}</p>
                                            {user.roles.length === 1 && user.roles[0] === 'basic_user' && <p className="max-w-64 text-xs text-muted-foreground">{subOrganizations.filter(sub => userMembershipIds.includes(sub.id)).map(sub => sub.name).join(', ')}</p>}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">{user.roles.map(role => <Badge key={role} variant="outline" className="text-xs font-normal">{roleLabels[role]}</Badge>)}</div>
                                        </TableCell>

                                        {/* Letzter Login */}
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {formatRelativeDate(user.lastLogin)}
                                            </span>
                                        </TableCell>

                                        {/* Status — not editable, changes automatically */}
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`font-normal text-xs border ${statusColors[user.status]}`}
                                            >
                                                {statusLabels[user.status]}
                                            </Badge>
                                        </TableCell>

                                        {/* Actions */}
                                        <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                            <span className="sr-only">Aktionen</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {/* Edit */}
                                                        {canEditUser(user) && (
                                                            <DropdownMenuItem
                                                                onSelect={() => setEditingUser(user)}
                                                                className="cursor-pointer"
                                                            >
                                                                <Pencil className="mr-2 h-4 w-4" />
                                                                Bearbeiten
                                                            </DropdownMenuItem>
                                                        )}

                                                        {/* Send Invite Email */}
                                                        <DropdownMenuItem
                                                            onSelect={() => setInviteRecipient(user)}
                                                            className="cursor-pointer"
                                                        >
                                                            <Mail className="mr-2 h-4 w-4" />
                                                            Einladung senden
                                                        </DropdownMenuItem>

                                                        {/* Impersonate (super_admin only) */}
                                                        {currentUserRoles.includes('super_admin') && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    disabled={impersonating === user.id}
                                                                    onSelect={async () => {
                                                                        setImpersonating(user.id)
                                                                        try {
                                                                            await impersonateUser(user.id)
                                                                        } catch (error) {
                                                                            if ((error as Error & { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
                                                                                throw error
                                                                            }
                                                                            alert('Impersonation fehlgeschlagen')
                                                                            setImpersonating(null)
                                                                        }
                                                                    }}
                                                                    className="cursor-pointer"
                                                                >
                                                                    <UserCog className="mr-2 h-4 w-4" />
                                                                    {impersonating === user.id ? 'Wechsle...' : 'Impersonate'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                            </>
                                                        )}

                                                        {/* Deactivate / Activate (admin and super_admin) */}
                                                        {canEditUser(user) && (
                                                            <>
                                                                {user.status === 'deactivated' ? (
                                                                    <DropdownMenuItem
                                                                        onSelect={() => setAccountAction({ kind: 'activate', user })}
                                                                        className="cursor-pointer"
                                                                    >
                                                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                                                        Aktivieren
                                                                    </DropdownMenuItem>
                                                                ) : (
                                                                    <DropdownMenuItem
                                                                        onSelect={() => setAccountAction({ kind: 'deactivate', user })}
                                                                        className="cursor-pointer text-amber-600 focus:text-amber-600"
                                                                    >
                                                                        <ShieldOff className="mr-2 h-4 w-4" />
                                                                        Deaktivieren
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuSeparator />
                                                            </>
                                                        )}

                                                        {/* Delete */}
                                                        {canEditUser(user) && (
                                                            <DropdownMenuItem
                                                                onSelect={() => setAccountAction({ kind: 'delete', user })}
                                                                className="cursor-pointer text-red-600 focus:text-red-600"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Löschen
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {selectedIds.size > 0
                        ? `${selectedIds.size} von ${tableUsers.length} Einträgen ausgewählt`
                        : `${tableUsers.length} Einträge insgesamt`
                    }
                </p>
                <div className="flex items-center gap-2">
                    {totalPages > 1 && (
                        <>
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Seite {page + 1} von {totalPages}
                            </span>
                            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                                Weiter <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </>
                    )}
                    <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                        <SelectTrigger className="w-[110px] h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[10, 25, 50, 100].map(n => (
                                <SelectItem key={n} value={String(n)}>{n} / Seite</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {editingUser && <UserEditorDialog
                key={editingUser.id}
                user={editingUser}
                subOrganizationIds={memberships.filter(m => m.userId === editingUser.id).map(m => m.subOrganizationId)}
                organizations={organizations} subOrganizations={subOrganizations} currentUserRoles={currentUserRoles}
                onClose={() => setEditingUser(null)} onSaved={() => router.refresh()}
            />}

            {inviteRecipient && <UserActionConfirmation
                title="Einladung senden?"
                description={`Eine Einladungs-E-Mail wird an ${inviteRecipient.email} gesendet.`}
                confirmLabel="Einladung senden"
                onClose={() => setInviteRecipient(null)}
                onConfirm={async () => {
                    const result = await sendInviteEmail(inviteRecipient.id)
                    if (!result.success) throw new Error(result.error || 'Die Einladung konnte nicht gesendet werden.')
                    toast({ title: 'Einladung gesendet', description: `E-Mail wurde an ${inviteRecipient.email} gesendet.` })
                    router.refresh()
                }}
            />}

            {accountAction && <UserActionConfirmation
                title={accountAction.kind === 'delete' ? 'Benutzer löschen?' : accountAction.kind === 'deactivate' ? 'Benutzer deaktivieren?' : 'Benutzer aktivieren?'}
                description={`${accountAction.user.name || accountAction.user.email} ${accountAction.user.name ? `· ${accountAction.user.email}` : ''}`}
                confirmLabel={accountAction.kind === 'delete' ? 'Benutzer löschen' : accountAction.kind === 'deactivate' ? 'Benutzer deaktivieren' : 'Benutzer aktivieren'}
                destructive={accountAction.kind === 'delete'} onConfirm={handleAccountAction} onClose={() => setAccountAction(null)}
            >
                <p className="text-sm">{accountAction.kind === 'delete'
                    ? 'Das Benutzerkonto wird dauerhaft gelöscht. Erfasste Berichte bleiben erhalten; die Verweise auf diesen Benutzer werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden.'
                    : accountAction.kind === 'deactivate'
                        ? 'Der Benutzer verliert den Zugriff und wird abgemeldet. Rollen und Organisationszuweisungen bleiben für eine spätere Aktivierung erhalten.'
                        : 'Der Benutzer erhält wieder Zugriff mit seinen bestehenden Rollen und Organisationszuweisungen.'}</p>
                <p className="text-sm text-muted-foreground">{accountAction.user.roles.map(role => roleLabels[role]).join(', ') || 'Keine Rolle'} · {accountAction.user.organizations?.name || 'Keine Organisation'}</p>
            </UserActionConfirmation>}
            {bulkReview && <UserActionConfirmation
                title={`${bulkReview.users.length} Benutzer: ${bulkReview.action === 'role' ? 'Rollen ersetzen?' : bulkReview.action === 'organization' ? 'Organisation wechseln?' : bulkReview.action === 'deactivate' ? 'Deaktivieren?' : bulkReview.action === 'activate' ? 'Aktivieren?' : 'Einladungen senden?'}`}
                description={bulkReview.action === 'invite' ? `Einladungs-E-Mails werden an die folgenden ${bulkReview.users.length} Benutzer gesendet.` : 'Prüfen Sie die betroffenen Benutzer vor dem Ausführen.'}
                confirmLabel={bulkReview.action === 'invite' ? 'Einladungen senden' : bulkReview.action === 'deactivate' ? 'Benutzer deaktivieren' : bulkReview.action === 'activate' ? 'Benutzer aktivieren' : 'Änderungen anwenden'}
                onConfirm={handleBulkAction} onClose={() => setBulkReview(null)}
            >
                <ul className="max-h-56 space-y-3 overflow-y-auto rounded-lg border bg-card p-4 text-sm">
                    {bulkReview.users.map(user => <li key={user.id}>
                        <p className="font-medium">{user.name || user.email}</p>{user.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
                        <p className="text-xs text-muted-foreground">{bulkReview.action === 'role'
                            ? `${user.roles.map(role => roleLabels[role]).join(', ') || 'Keine Rolle'} → ${roleLabels[bulkReview.value as AppRole]}`
                            : bulkReview.action === 'organization'
                                ? `${user.organizations?.name || 'Keine Organisation'} → ${organizations.find(org => org.id === bulkReview.value)?.name || 'Keine Organisation'}`
                                : bulkReview.action === 'invite' ? `Einladung an ${user.email}` : `${statusLabels[user.status]} → ${bulkReview.action === 'activate' ? 'Aktiv' : 'Deaktiviert'}`}</p>
                    </li>)}
                </ul>
                {bulkReview.action === 'role' && <p className="text-sm">Alle bisherigen Rollen der ausgewählten Benutzer werden durch diese Rolle ersetzt. Bestehende Sitzungen werden beendet.</p>}
                {bulkReview.action === 'organization' && <p className="text-sm text-amber-800">Bei einem Organisationswechsel werden bisherige Unterorganisations-Zuweisungen entfernt. Neue Zuweisungen müssen anschließend pro Benutzer eingerichtet werden. Bestehende Sitzungen werden beendet.</p>}
                {bulkReview.action === 'deactivate' && <p className="text-sm">Die Benutzer verlieren den Zugriff und werden abgemeldet. Ihre Zuweisungen bleiben gespeichert.</p>}
                {bulkReview.action === 'activate' && <p className="text-sm">Die Benutzer erhalten wieder Zugriff mit ihren bestehenden Rollen und Zuweisungen.</p>}
            </UserActionConfirmation>}

        </div>
    )
}
