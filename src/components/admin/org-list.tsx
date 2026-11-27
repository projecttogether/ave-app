'use client'

import { useState, Fragment } from 'react'
import { OrganizationWithSubs, SubOrganization } from '@/types/auth'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { OrgForm } from './org-form'
import { SubOrgForm } from './sub-org-form'
import { Plus, Edit2, CornerDownRight, Trash2 } from 'lucide-react'
import { deleteOrganization } from '@/app/admin/actions'
import { deleteSubOrganization } from '@/app/actions/sub-organizations'

interface SubOrganizationWithStringDates extends Omit<SubOrganization, 'createdAt'> {
    createdAt?: string | null;
}

interface OrganizationWithSubsStringDates extends Omit<OrganizationWithSubs, 'createdAt' | 'subOrganizations'> {
    createdAt?: string | null;
    subOrganizations?: SubOrganizationWithStringDates[];
}

interface OrgListProps {
    initialOrganizations: OrganizationWithSubsStringDates[]
}

export function OrgList({ initialOrganizations }: OrgListProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [statsEditingOrg, setStatsEditingOrg] = useState<OrganizationWithSubsStringDates | undefined>(undefined)
    const [isDeleting, setIsDeleting] = useState(false)

    // Sub Org States
    const [createSubOrgParentId, setCreateSubOrgParentId] = useState<string | null>(null)
    const [editingSubOrg, setEditingSubOrg] = useState<{ parentId: string, subOrg: SubOrganizationWithStringDates } | null>(null)


    const handleEditOrg = (org: OrganizationWithSubsStringDates) => {
        setStatsEditingOrg(org)
    }

    const handleCreateSubOrg = (orgId: string) => {
        setCreateSubOrgParentId(orgId)
    }

    const handleEditSubOrg = (parentId: string, subOrg: SubOrganizationWithStringDates) => {
        setEditingSubOrg({ parentId, subOrg })
    }

    const handleDeleteOrg = async (orgId: string) => {
        if (!window.confirm('Möchten Sie diese Organisation wirklich löschen? Alle zugehörigen Daten (Benutzerzuordnungen, Unterorganisationen, Indikatoren) werden gelöscht.')) return;
        
        setIsDeleting(true)
        try {
            await deleteOrganization(orgId)
        } catch (error) {
            console.error('Failed to delete organization', error)
            alert('Organisation konnte nicht gelöscht werden.')
        } finally {
            setIsDeleting(false)
        }
    }

    const handleDeleteSubOrg = async (subOrgId: string) => {
        if (!window.confirm('Möchten Sie diese Unterorganisation wirklich löschen? Alle zugehörigen Daten in dieser Unterorganisation werden gelöscht.')) return;
        
        setIsDeleting(true)
        try {
            await deleteSubOrganization(subOrgId)
        } catch (error) {
            console.error('Failed to delete sub-organization', error)
            alert('Unterorganisation konnte nicht gelöscht werden.')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Organisationen</h2>
                <Button onClick={() => { setStatsEditingOrg(undefined); setIsCreateOpen(true) }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Organisation erstellen
                </Button>
            </div>

            {/* Org Dialogs */}
            <OrgForm
                open={isCreateOpen || !!statsEditingOrg}
                onOpenChange={(open) => {
                    setIsCreateOpen(open)
                    if (!open) setStatsEditingOrg(undefined)
                }}
                organizationToEdit={statsEditingOrg ? {
                    ...statsEditingOrg,
                    createdAt: statsEditingOrg.createdAt ? new Date(statsEditingOrg.createdAt) : null
                } : undefined}
                key={statsEditingOrg?.id || 'new-org'}
            />

            {/* Sub Org Dialogs */}
            <SubOrgForm
                open={!!createSubOrgParentId || !!editingSubOrg}
                onOpenChange={(open) => {
                    if (!open) {
                        setCreateSubOrgParentId(null)
                        setEditingSubOrg(null)
                    }
                }}
                parentOrganizationId={createSubOrgParentId || editingSubOrg?.parentId || ''}
                subOrganizationToEdit={editingSubOrg?.subOrg ? {
                    ...editingSubOrg.subOrg,
                    createdAt: editingSubOrg.subOrg.createdAt ? new Date(editingSubOrg.subOrg.createdAt) : null
                } : undefined}
                key={editingSubOrg?.subOrg.id || 'new-sub-org'}
            />



            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead>Erstellt am</TableHead>
                            <TableHead className="text-right">Aktionen</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialOrganizations.map((org) => (
                            <Fragment key={org.id}>
                                <TableRow className="bg-slate-50/50">
                                    <TableCell className="font-bold">{org.name}</TableCell>
                                    <TableCell className="text-muted-foreground text-xs uppercase">Organisation</TableCell>
                                    <TableCell>{org.createdAt && new Date(org.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEditOrg(org)} disabled={isDeleting}>
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteOrg(org.id)} disabled={isDeleting} className="text-destructive">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => handleCreateSubOrg(org.id)} disabled={isDeleting}>
                                            <Plus className="w-4 h-4 mr-2" /> Unterorg. hinzufügen
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                {org.subOrganizations?.map((subOrg) => (
                                    <TableRow key={subOrg.id}>
                                        <TableCell className="pl-8 flex items-center gap-2">
                                            <CornerDownRight className="w-4 h-4 text-muted-foreground" />
                                            {subOrg.name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs uppercase">Unterorganisation</TableCell>
                                        <TableCell>{subOrg.createdAt && new Date(subOrg.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleEditSubOrg(org.id, subOrg)} disabled={isDeleting}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteSubOrg(subOrg.id)} disabled={isDeleting} className="text-destructive">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </Fragment>
                        ))}
                        {initialOrganizations.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                    Keine Organisationen gefunden.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
