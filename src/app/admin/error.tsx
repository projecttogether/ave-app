'use client'

import { useEffect } from 'react'
import { captureException } from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        captureException(error)
        console.error('Admin error:', error)
    }, [error])

    return (
        <div className="flex items-center justify-center py-12">
            <Card className="max-w-md w-full">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center gap-4">
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                        <div className="space-y-2">
                            <h2 className="text-lg font-semibold">Etwas ist schief gelaufen</h2>
                            <p className="text-sm text-muted-foreground">
                                Die Seite konnte nicht geladen werden.
                            </p>
                        </div>
                        <Button onClick={reset} variant="outline">
                            Erneut versuchen
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
