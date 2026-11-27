'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { SubOrganization } from '@/types/auth'
import { createSubOrganization, updateSubOrganization } from '@/app/actions/sub-organizations'
import { useRouter } from 'next/navigation'

interface SubOrgFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    parentOrganizationId: string
    subOrganizationToEdit?: SubOrganization
}

export function SubOrgForm({ open, onOpenChange, parentOrganizationId, subOrganizationToEdit }: SubOrgFormProps) {
    const [name, setName] = useState(subOrganizationToEdit?.name || '')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (subOrganizationToEdit) {
                await updateSubOrganization(subOrganizationToEdit.id, name)
            } else {
                await createSubOrganization(parentOrganizationId, name)
            }
            onOpenChange(false)
            router.refresh()
            if (!subOrganizationToEdit) setName('') // Clear if creating
        } catch (error) {
            console.error('Failed to save sub-organization', error)
            alert('Failed to save sub-organization')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{subOrganizationToEdit ? 'Unterorganisation bearbeiten' : 'Unterorganisation erstellen'}</DialogTitle>
                    <DialogDescription>
                        {subOrganizationToEdit ? 'Unterorganisationsdetails aktualisieren.' : 'Neue Unterorganisation hinzufügen.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="py-4">
                        <Field>
                            <FieldLabel htmlFor="name">Name</FieldLabel>
                            <Input
                                id="name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Speichert...' : 'Speichern'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
