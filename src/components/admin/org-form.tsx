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
import { Organization } from '@/types/auth'
import { createOrganization, updateOrganization } from '@/app/admin/actions'
import { useRouter } from 'next/navigation'

interface OrgFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    organizationToEdit?: Organization
}

export function OrgForm({ open, onOpenChange, organizationToEdit }: OrgFormProps) {
    const [name, setName] = useState(organizationToEdit?.name || '')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (organizationToEdit) {
                await updateOrganization(organizationToEdit.id, name)
            } else {
                await createOrganization(name)
            }
            onOpenChange(false)
            router.refresh()
            if (!organizationToEdit) setName('') // Clear if creating
        } catch (error) {
            console.error('Failed to save organization', error)
            alert('Failed to save organization')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{organizationToEdit ? 'Organisation bearbeiten' : 'Organisation erstellen'}</DialogTitle>
                    <DialogDescription>
                        {organizationToEdit ? 'Organisationsdetails aktualisieren.' : 'Neue Organisation hinzufügen.'}
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
