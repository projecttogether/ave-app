'use client'

import { useRef, useState, type ReactNode } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

export function UserActionConfirmation({ title, description, confirmLabel, destructive = false, children, onConfirm, onClose }: {
    title: string
    description: string
    confirmLabel: string
    destructive?: boolean
    children?: ReactNode
    onConfirm: () => Promise<void>
    onClose: () => void
}) {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const submitting = useRef(false)
    const confirm = async () => {
        if (submitting.current) return
        submitting.current = true
        setPending(true)
        setError(null)
        try {
            await onConfirm()
            onClose()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Die Aktion konnte nicht ausgeführt werden.')
        } finally {
            submitting.current = false
            setPending(false)
        }
    }
    return <AlertDialog open onOpenChange={open => { if (!open && !submitting.current) onClose() }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
            {children}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
                <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={event => { event.preventDefault(); void confirm() }}>{pending ? 'Wird ausgeführt…' : confirmLabel}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
}
