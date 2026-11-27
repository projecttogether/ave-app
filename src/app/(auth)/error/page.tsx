import { Metadata } from 'next'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: "Fehler",
}

export default async function AuthErrorPage(props: { searchParams: Promise<{ error?: string }> }) {
    const session = await auth()
    const params = await props.searchParams
    const error = params.error

    if (session?.user?.email) {
        redirect('/dashboard')
    }

    return (
        <AuthErrorContent error={error} />
    )
}

function AuthErrorContent({ error }: { error?: string }) {
    const errorMap: Record<string, string> = {
        Configuration: "Es gibt ein Problem mit der Server-Konfiguration.",
        AccessDenied: "Zugriff verweigert.",
        Verification: "Der Anmeldelink ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.",
        OAuthAccountNotLinked: "Diese E-Mail-Adresse ist bereits mit einer anderen Anmeldemethode verknüpft.",
        Default: "Ein unbekannter Fehler ist aufgetreten."
    }

    const errorMessage = error && errorMap[error] ? errorMap[error] : errorMap.Default

    return (
        <Card className="w-full border-0 shadow-none p-0 text-center">
            <CardHeader className="px-0 pt-0 pb-6 flex flex-col items-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <CardTitle className="text-2xl font-body">Anmeldung fehlgeschlagen</CardTitle>
                <CardDescription className="max-w-xs mx-auto mt-2 text-red-600">
                    {errorMessage}
                </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-center px-0">
                <Button variant="outline" asChild>
                    <Link href="/login" className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Zurück zur Anmeldung
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}
