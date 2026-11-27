'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { SubOrganizationMember, Profile } from '@/types/auth'
import { getSubOrganizationMembers, addSubOrganizationMember, removeSubOrganizationMember } from '@/app/actions/sub-organizations'
import { getUsers } from '@/app/admin/actions'
import { Loader2, Trash2, Plus } from 'lucide-react'

interface SubOrgMembersProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    subOrgId: string
    subOrgName: string
}

export function SubOrgMembers({ open, onOpenChange, subOrgId, subOrgName }: SubOrgMembersProps) {
    const [members, setMembers] = useState<(SubOrganizationMember & { profiles: { email: string | null } | null })[]>([])
    const [allUsers, setAllUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedUserId, setSelectedUserId] = useState<string>('')
    const [selectedRole, setSelectedRole] = useState<'organization_manager' | 'organization_user'>('organization_user')
    const [adding, setAdding] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [membersData, usersData] = await Promise.all([
                getSubOrganizationMembers(subOrgId),
                getUsers()
            ])
            setMembers(membersData as any)
            setAllUsers(usersData as any)
        } catch (error) {
            console.error('Failed to fetch data', error)
        } finally {
            setLoading(false)
        }
    }, [subOrgId])

    useEffect(() => {
        if (open) {
            fetchData()
        }
    }, [open, fetchData])

    const handleAddMember = async () => {
        if (!selectedUserId) return
        setAdding(true)
        try {
            await addSubOrganizationMember(subOrgId, selectedUserId, selectedRole)
            await fetchData() // Refresh list
            setSelectedUserId('')
        } catch (error) {
            alert('Failed to add member')
        } finally {
            setAdding(false)
        }
    }

    const handleRemoveMember = async (userId: string) => {
        if (!confirm('Sind Sie sicher, dass Sie dieses Mitglied entfernen möchten?')) return
        try {
            await removeSubOrganizationMember(subOrgId, userId)
            setMembers(prev => prev.filter(m => m.userId !== userId))
        } catch (error) {
            alert('Failed to remove member')
        }
    }

    // Filter out users who are already members
    const availableUsers = allUsers.filter(user =>
        !members.some(member => member.userId === user.id)
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Mitglieder verwalten - {subOrgName}</DialogTitle>
                    <DialogDescription>
                        Benutzer zu dieser Unterorganisation hinzufügen oder entfernen.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {/* Add Member Section */}
                    <div className="flex items-end gap-4 p-4 border rounded-lg bg-slate-50">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Benutzer</label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Benutzer wählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableUsers.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.email || user.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[200px] space-y-2">
                            <label className="text-sm font-medium">Rolle</label>
                            <Select value={selectedRole} onValueChange={(val: any) => setSelectedRole(val)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="organization_user">Benutzer</SelectItem>
                                    <SelectItem value="organization_manager">Manager</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAddMember} disabled={!selectedUserId || adding}>
                            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Hinzufügen
                        </Button>
                    </div>

                    {/* Members List */}
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>E-Mail</TableHead>
                                    <TableHead>Rolle</TableHead>
                                    <TableHead className="text-right">Aktionen</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : members.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            Noch keine Mitglieder.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    members.map((member) => (
                                        <TableRow key={member.id}>
                                            <TableCell>{member.profiles?.email || 'Unbekannt'}</TableCell>
                                            <TableCell className="capitalize">{member.role.replace('_', ' ')}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleRemoveMember(member.userId)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
