'use client'

import { useState } from 'react'
import { SubOrganization } from '@/types/auth'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { SubOrgForm } from '@/components/admin/sub-org-form'
import { Plus, Edit2, CornerDownRight } from 'lucide-react'

interface SubOrganizationWithStringDates extends Omit<SubOrganization, 'createdAt'> {
    createdAt?: string | null
}

interface OrganizationData {
    id: string
    name: string
    createdAt?: string | null
    subOrganizations: SubOrganizationWithStringDates[]
}

interface SubOrgManagerProps {
    organization: OrganizationData
}

export function SubOrgManager({ organization }: SubOrgManagerProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editingSubOrg, setEditingSubOrg] = useState<SubOrganizationWithStringDates | null>(null)

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Unterorganisationen</h2>
                <Button onClick={() => { setEditingSubOrg(null); setIsCreateOpen(true) }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Unterorganisation erstellen
                </Button>
            </div>

            <SubOrgForm
                open={isCreateOpen || !!editingSubOrg}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateOpen(false)
                        setEditingSubOrg(null)
                    }
                }}
                parentOrganizationId={organization.id}
                subOrganizationToEdit={editingSubOrg ? {
                    ...editingSubOrg,
                    createdAt: editingSubOrg.createdAt ? new Date(editingSubOrg.createdAt) : null,
                } : undefined}
                key={editingSubOrg?.id || 'new-sub-org'}
            />

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Erstellt am</TableHead>
                            <TableHead className="text-right">Aktionen</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {organization.subOrganizations.map((subOrg) => (
                            <TableRow key={subOrg.id}>
                                <TableCell className="flex items-center gap-2">
                                    <CornerDownRight className="w-4 h-4 text-muted-foreground" />
                                    {subOrg.name}
                                </TableCell>
                                <TableCell>{subOrg.createdAt && new Date(subOrg.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => setEditingSubOrg(subOrg)}>
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {organization.subOrganizations.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                    Keine Unterorganisationen vorhanden.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
