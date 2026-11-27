'use client'

import { useState, useTransition } from 'react'
import { updateName } from '@/app/actions/user'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export default function NameForm({ currentName }: { currentName?: string | null }) {
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    async function handleSubmit(formData: FormData) {
        const name = (formData.get('name') as string).trim()

        if (!name) {
            setMessage({ type: 'error', text: 'Bitte geben Sie einen Namen ein.' })
            return
        }

        setMessage(null)

        startTransition(async () => {
            try {
                const result = await updateName(name)
                if (result.success) {
                    setMessage({ type: 'success', text: 'Name erfolgreich aktualisiert.' })
                }
            } catch (error) {
                setMessage({ type: 'error', text: 'Fehler beim Aktualisieren des Namens.' })
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Name ändern</CardTitle>
                <CardDescription>
                    Ihr Anzeigename wird in der Navigation und im Profil angezeigt.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form action={handleSubmit} id="name-form" className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            name="name"
                            type="text"
                            defaultValue={currentName || ''}
                            required
                            placeholder="Ihr Name"
                        />
                    </div>

                    {message && (
                        <div className={`flex items-center space-x-2 text-sm p-3 rounded ${
                            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            <p>{message.text}</p>
                        </div>
                    )}

                    <Button type="submit" disabled={isPending}>
                        {isPending ? 'Speichern...' : 'Name speichern'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
