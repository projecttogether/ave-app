"use client"

import * as React from "react"
import { signIn } from "next-auth/webauthn"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { KeyRound, Smartphone, Trash2, Pencil, Check, X } from "lucide-react"
import { getUserPasskeys, deletePasskey, renamePasskey } from "@/app/actions/passkeys"

export default function PasskeySettings() {
    const [isLoading, setIsLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [passkeys, setPasskeys] = React.useState<any[]>([])
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editingName, setEditingName] = React.useState("")
    const [webAuthnAvailable, setWebAuthnAvailable] = React.useState(true)

    const loadPasskeys = async () => {
        try {
            const keys = await getUserPasskeys()
            setPasskeys(keys)
        } catch (err) {
            console.error("Failed to load passkeys:", err)
        }
    }

    React.useEffect(() => {
        if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
            setWebAuthnAvailable(false)
        }
        loadPasskeys()
    }, [])

    const handleRegisterPasskey = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const res = await signIn("webauthn", { action: "register", redirect: false })
            if (!res || res.error || !res.ok) {
                setError("Passkey konnte nicht erstellt werden. Melden Sie sich erneut mit Ihrem eigenen Konto an und versuchen Sie es innerhalb von 10 Minuten erneut.")
            } else {
                await loadPasskeys()
            }
        } catch (err: any) {
            console.error("Fehler beim Erstellen des Passkeys:", err)
            if (err.name === 'NotAllowedError') {
                setError("Passkey-Erstellung wurde abgebrochen oder ist in Ihrem Browser nicht verfügbar.")
            } else {
                setError("Passkey konnte nicht erstellt werden. Ihr Browser oder Ihre Unternehmensrichtlinien unterstützen diese Funktion möglicherweise nicht.")
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleRenamePasskey = async (credentialID: string) => {
        try {
            await renamePasskey(credentialID, editingName)
            setEditingId(null)
            await loadPasskeys()
        } catch (err: any) {
            setError("Fehler beim Umbenennen des Passkeys.")
        }
    }

    const handleDeletePasskey = async (credentialID: string) => {
        if (!confirm("Möchten Sie diesen Passkey wirklich entfernen?")) return
        try {
            await deletePasskey(credentialID)
            await loadPasskeys()
        } catch (err: any) {
            setError("Fehler beim Löschen des Passkeys.")
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Passkeys
                </CardTitle>
                <CardDescription>
                    Verwalten Sie Ihre Passkeys für eine schnelle und sichere Anmeldung (z.B. Touch ID, Face ID, Windows Hello).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {!webAuthnAvailable && (
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                        Passkeys werden von Ihrem Browser nicht unterstützt. Dies kann an Unternehmensrichtlinien oder einer veralteten Browser-Version liegen.
                    </div>
                )}

                {error && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                        {error}
                        <Button variant="link" onClick={() => signOut({ callbackUrl: '/login?callbackUrl=%2Fsettings' })}>
                            Abmelden und erneut anmelden
                        </Button>
                    </div>
                )}

                {passkeys.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-900 border-b pb-2">Gespeicherte Passkeys</h4>
                        <ul className="space-y-2">
                            {passkeys.map((pk) => (
                                <li key={pk.credentialID} className="flex items-center justify-between p-3 bg-gray-50 border rounded-md">
                                    <div className="flex items-center gap-3 flex-1 overflow-hidden pr-2">
                                        <Smartphone className="h-4 w-4 text-gray-500 shrink-0" />
                                        {editingId === pk.credentialID ? (
                                            <Input 
                                                autoFocus
                                                value={editingName} 
                                                onChange={(e) => setEditingName(e.target.value)}
                                                className="h-8 text-sm"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenamePasskey(pk.credentialID)
                                                    if (e.key === 'Escape') setEditingId(null)
                                                }}
                                            />
                                        ) : (
                                            <span className="text-sm font-medium text-gray-900 truncate">
                                                {pk.name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {editingId === pk.credentialID ? (
                                            <>
                                                <Button variant="ghost" size="icon" onClick={() => handleRenamePasskey(pk.credentialID)}>
                                                    <Check className="h-4 w-4 text-green-600" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                                                    <X className="h-4 w-4 text-gray-500" />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    setEditingName(pk.name || "Unbekanntes Gerät")
                                                    setEditingId(pk.credentialID)
                                                }}>
                                                    <Pencil className="h-4 w-4 text-gray-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeletePasskey(pk.credentialID)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {webAuthnAvailable && (
                    <div>
                        <p className="mb-3 text-sm text-muted-foreground">
                            Zum Hinzufügen ist eine Anmeldung innerhalb der letzten 10 Minuten erforderlich. Während Sie als anderer Benutzer angemeldet sind, ist dies nicht möglich.
                        </p>
                        <Button
                            onClick={handleRegisterPasskey}
                            className="w-full sm:w-auto"
                            disabled={isLoading}
                        >
                            <KeyRound className="mr-2 h-4 w-4" />
                            {isLoading ? "Wird erstellt..." : "Neuen Passkey hinzufügen"}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
