'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, AppRole, Organization } from '@/types/auth'
import { updateUserRolesArray, createUser, updateUserOrganization, updateUserEmail, deleteUser, updateUserSubOrganizations } from '@/app/admin/actions'
import { impersonateUser } from '@/app/actions/impersonate'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoreHorizontal, UserCog, Trash2, Mail } from 'lucide-react'

interface SubOrgInfo {
    id: string
    name: string
    organizationId: string
    organizationName: string
}

interface SubOrgMembership {
    userId: string
    subOrganizationId: string
}

interface UserListProps {
    initialUsers: (Profile & { organizations: { name: string } | null })[]
    organizations: Organization[]
    currentUserRoles: AppRole[]
    subOrganizations: SubOrgInfo[]
    userSubOrgMemberships: SubOrgMembership[]
}

export function UserList({ initialUsers, organizations, currentUserRoles, subOrganizations, userSubOrgMemberships }: UserListProps) {
    const [users, setUsers] = useState(initialUsers)
    const [memberships, setMemberships] = useState(userSubOrgMemberships)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [newUserEmail, setNewUserEmail] = useState('')
    const [newUserRoles, setNewUserRoles] = useState<AppRole[]>(['basic_user'])
    const [newUserOrgId, setNewUserOrgId] = useState<string>('none')
    const [newUserSubOrgIds, setNewUserSubOrgIds] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [impersonating, setImpersonating] = useState<string | null>(null)

    // Edit email state
    const [editEmailUserId, setEditEmailUserId] = useState<string | null>(null)
    const [editEmailValue, setEditEmailValue] = useState('')
    const [editEmailLoading, setEditEmailLoading] = useState(false)

    // Delete state
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const router = useRouter()

    const handleRoleToggle = async (userId: string, targetRole: AppRole, currentRoles: AppRole[]) => {
        try {
            const hasRole = currentRoles.includes(targetRole);
            const newRoles = hasRole 
                ? currentRoles.filter(r => r !== targetRole)
                : [...currentRoles, targetRole];
            
            await updateUserRolesArray(userId, newRoles)
            setUsers(users.map(u => u.id === userId ? { ...u, roles: newRoles } : u))
            router.refresh()
        } catch (error) {
            console.error('Failed to update role', error)
            alert('Failed to update role')
        }
    }

    const handleOrgChange = async (userId: string, newOrgId: string) => {
        try {
            const orgId = newOrgId === 'none' ? null : newOrgId
            await updateUserOrganization(userId, orgId)
            const orgName = organizations.find(o => o.id === orgId)?.name
            setUsers(users.map(u => u.id === userId ? { ...u, organizationId: orgId, organizations: orgName ? { name: orgName } : null } : u))
            router.refresh()
        } catch (error) {
            console.error('Failed to update organization', error)
            alert('Failed to update organization')
        }
    }

    const handleSubOrgToggle = async (userId: string, subOrgId: string) => {
        const userMemberships = memberships.filter(m => m.userId === userId)
        const isCurrentlyMember = userMemberships.some(m => m.subOrganizationId === subOrgId)

        const newSubOrgIds = isCurrentlyMember
            ? userMemberships.filter(m => m.subOrganizationId !== subOrgId).map(m => m.subOrganizationId)
            : [...userMemberships.map(m => m.subOrganizationId), subOrgId]

        try {
            await updateUserSubOrganizations(userId, newSubOrgIds)
            // Update local state
            const otherMemberships = memberships.filter(m => m.userId !== userId)
            const newMemberships = newSubOrgIds.map(id => ({ userId, subOrganizationId: id }))
            setMemberships([...otherMemberships, ...newMemberships])
        } catch (error) {
            console.error('Failed to update sub-organizations', error)
            alert('Fehler beim Aktualisieren der Unterorganisationen')
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const orgId = newUserOrgId === 'none' ? undefined : newUserOrgId
            const result = await createUser(newUserEmail, newUserRoles, orgId)

            // If sub-orgs were selected, assign them
            if (newUserSubOrgIds.length > 0 && result.user) {
                await updateUserSubOrganizations(result.user.id, newUserSubOrgIds)
            }

            setIsCreateOpen(false)
            setNewUserEmail('')
            setNewUserOrgId('none')
            setNewUserSubOrgIds([])
            router.refresh()
        } catch (error) {
            console.error('Failed to create user', error)
            alert('Failed to create user: ' + (error as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleEditEmail = async () => {
        if (!editEmailUserId) return
        setEditEmailLoading(true)
        try {
            await updateUserEmail(editEmailUserId, editEmailValue)
            setUsers(users.map(u => u.id === editEmailUserId ? { ...u, email: editEmailValue.trim() } : u))
            setEditEmailUserId(null)
            setEditEmailValue('')
            router.refresh()
        } catch (error) {
            alert((error as Error).message)
        } finally {
            setEditEmailLoading(false)
        }
    }

    const handleDeleteUser = async () => {
        if (!deleteUserId) return
        setDeleteLoading(true)
        try {
            await deleteUser(deleteUserId)
            setUsers(users.filter(u => u.id !== deleteUserId))
            setMemberships(memberships.filter(m => m.userId !== deleteUserId))
            setDeleteUserId(null)
            router.refresh()
        } catch (error) {
            alert('Fehler beim Löschen: ' + (error as Error).message)
        } finally {
            setDeleteLoading(false)
        }
    }

    // Get sub-orgs for a specific user's organization
    const getSubOrgsForUser = (orgId: string | null) => {
        if (!orgId) return []
        return subOrganizations.filter(s => s.organizationId === orgId)
    }

    // Get sub-orgs for the selected new user org in the create dialog
    const newUserAvailableSubOrgs = newUserOrgId !== 'none'
        ? subOrganizations.filter(s => s.organizationId === newUserOrgId)
        : []

    const handleNewUserSubOrgToggle = (subOrgId: string) => {
        setNewUserSubOrgIds(prev =>
            prev.includes(subOrgId) ? prev.filter(id => id !== subOrgId) : [...prev, subOrgId]
        )
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Benutzer</h2>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>Benutzer erstellen</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Neuen Benutzer erstellen</DialogTitle>
                            <DialogDescription>
                                Fügen Sie der Organisation einen neuen Benutzer hinzu.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateUser}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="email" className="text-right">E-Mail</Label>
                                    <Input id="email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="col-span-3" required />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right pt-2">Rollen</Label>
                                    <div className="col-span-3 border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                                        {[
                                            { id: 'super_admin', label: 'Super Admin' },
                                            { id: 'admin', label: 'Admin' },
                                            { id: 'org_manager', label: 'Org Manager' },
                                            { id: 'org_view_only', label: 'Org View Only' },
                                            { id: 'global_view_only', label: 'Global View Only' },
                                            { id: 'basic_user', label: 'Basic User' }
                                        ].map(role => {
                                            if (role.id === 'super_admin' && !currentUserRoles.includes('super_admin')) return null;
                                            return (
                                                <label key={role.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={newUserRoles.includes(role.id as AppRole)}
                                                        onChange={() => {
                                                            setNewUserRoles(prev =>
                                                                prev.includes(role.id as AppRole)
                                                                    ? prev.filter(r => r !== role.id)
                                                                    : [...prev, role.id as AppRole]
                                                            )
                                                        }}
                                                        className="rounded"
                                                    />
                                                    {role.label}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="org" className="text-right">Org</Label>
                                    <Select value={newUserOrgId} onValueChange={(val) => {
                                        setNewUserOrgId(val)
                                        setNewUserSubOrgIds([]) // Reset sub-orgs when org changes
                                    }}>
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Organisation wählen" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Keine</SelectItem>
                                            {organizations.map((org) => (
                                                <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {newUserAvailableSubOrgs.length > 0 && (
                                    <div className="grid grid-cols-4 items-start gap-4">
                                        <Label className="text-right pt-2">Sub-Orgs</Label>
                                        <div className="col-span-3 border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                                            {newUserAvailableSubOrgs.map(subOrg => (
                                                <label key={subOrg.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={newUserSubOrgIds.includes(subOrg.id)}
                                                        onChange={() => handleNewUserSubOrgToggle(subOrg.id)}
                                                        className="rounded"
                                                    />
                                                    {subOrg.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={loading}>{loading ? 'Erstelle...' : 'Erstellen'}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>E-Mail</TableHead>
                            <TableHead>Organisation</TableHead>
                            <TableHead>Sub-Orgs</TableHead>
                            <TableHead>Rolle</TableHead>
                            <TableHead className="text-right">Aktionen</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => {
                            const userSubOrgs = getSubOrgsForUser(user.organizationId)
                            const userMembershipIds = memberships
                                .filter(m => m.userId === user.id)
                                .map(m => m.subOrganizationId)

                            return (
                                <TableRow key={user.id}>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <Select
                                            defaultValue={user.organizationId || 'none'}
                                            onValueChange={(val) => handleOrgChange(user.id, val)}
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Org wählen" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Keine</SelectItem>
                                                {organizations.map((org) => (
                                                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {userSubOrgs.length > 0 ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="w-[180px] justify-start text-left font-normal">
                                                        {userMembershipIds.length === 0
                                                            ? 'Keine'
                                                            : `${userMembershipIds.length} ausgewählt`}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-[220px]" align="start">
                                                    {userSubOrgs.map(subOrg => (
                                                        <DropdownMenuItem
                                                            key={subOrg.id}
                                                            onSelect={(e) => {
                                                                e.preventDefault()
                                                                handleSubOrgToggle(user.id, subOrg.id)
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={userMembershipIds.includes(subOrg.id)}
                                                                    readOnly
                                                                    className="rounded pointer-events-none"
                                                                />
                                                                <span className="text-sm">{subOrg.name}</span>
                                                            </div>
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-[180px] justify-start text-left font-normal truncate">
                                                    {user.roles.length === 0
                                                        ? 'Keine Rollen'
                                                        : user.roles.join(', ')}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-[220px]" align="start">
                                                {[
                                                    { id: 'super_admin', label: 'Super Admin' },
                                                    { id: 'admin', label: 'Admin' },
                                                    { id: 'org_manager', label: 'Org Manager' },
                                                    { id: 'org_view_only', label: 'Org View Only' },
                                                    { id: 'global_view_only', label: 'Global View Only' },
                                                    { id: 'basic_user', label: 'Basic User' }
                                                ].map(role => {
                                                    if (role.id === 'super_admin' && !currentUserRoles.includes('super_admin')) return null;
                                                    return (
                                                        <DropdownMenuItem
                                                            key={role.id}
                                                            onSelect={(e) => {
                                                                e.preventDefault()
                                                                handleRoleToggle(user.id, role.id as AppRole, user.roles)
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={user.roles.includes(role.id as AppRole)}
                                                                    readOnly
                                                                    className="rounded pointer-events-none"
                                                                />
                                                                <span className="text-sm">{role.label}</span>
                                                            </div>
                                                        </DropdownMenuItem>
                                                    )
                                                })}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                    <span className="sr-only">Aktionen</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
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
                                                                    console.error('Failed to impersonate', error)
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
                                                <DropdownMenuItem
                                                    onSelect={() => {
                                                        setEditEmailUserId(user.id)
                                                        setEditEmailValue(user.email || '')
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <Mail className="mr-2 h-4 w-4" />
                                                    E-Mail bearbeiten
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onSelect={() => setDeleteUserId(user.id)}
                                                    className="cursor-pointer text-red-600 focus:text-red-600"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Benutzer löschen
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Email Dialog */}
            <Dialog open={!!editEmailUserId} onOpenChange={(open) => { if (!open) setEditEmailUserId(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>E-Mail bearbeiten</DialogTitle>
                        <DialogDescription>
                            Ändern Sie die E-Mail-Adresse des Benutzers. Dabei werden alle Sitzungen beendet, hinterlegte Passkeys entfernt und die bisherige Adresse benachrichtigt.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="editEmail" className="text-right">E-Mail</Label>
                            <Input
                                id="editEmail"
                                type="email"
                                value={editEmailValue}
                                onChange={e => setEditEmailValue(e.target.value)}
                                className="col-span-3"
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditEmailUserId(null)}>Abbrechen</Button>
                        <Button onClick={handleEditEmail} disabled={editEmailLoading}>
                            {editEmailLoading ? 'Speichere...' : 'Speichern'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteUserId} onOpenChange={(open) => { if (!open) setDeleteUserId(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Benutzer löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Diese Aktion kann nicht rückgängig gemacht werden. Der Benutzer und alle zugehörigen Daten werden dauerhaft gelöscht.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteUser}
                            disabled={deleteLoading}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {deleteLoading ? 'Lösche...' : 'Löschen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
