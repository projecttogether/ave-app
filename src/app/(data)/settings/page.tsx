import { Metadata } from 'next'
import { auth } from '@/auth'
import NameForm from './name-form'
import PasskeySettings from './passkey-settings'
import { EditableText } from '@/components/editable-text'
import { RevokeSessionsButton } from './revoke-sessions-button'
import { ExportDataButton } from './export-data-button'

export const metadata: Metadata = {
    title: 'Einstellungen',
}

export default async function SettingsPage() {
    const session = await auth()
    const userName = session?.user?.name ?? null

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Einstellungen</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="page.settings.subtitle" initialValue="Verwalten Sie hier Ihr Profil und Ihre Sicherheitseinstellungen." isTextarea>
                        Verwalten Sie hier Ihr Profil und Ihre Sicherheitseinstellungen.
                    </EditableText>
                </p>
            </div>
            <div className="max-w-xl space-y-6">
                <NameForm currentName={userName} />
                <PasskeySettings />
                <div className="border rounded-lg p-4 space-y-2">
                    <h3 className="font-medium">Sitzungsverwaltung</h3>
                    <p className="text-sm text-muted-foreground">
                        Melden Sie sich auf allen anderen Geraeten ab.
                    </p>
                    <RevokeSessionsButton />
                </div>
                <div className="border rounded-lg p-4 space-y-2">
                    <h3 className="font-medium">Datenschutz</h3>
                    <p className="text-sm text-muted-foreground">
                        Laden Sie eine Kopie aller Ihrer gespeicherten Daten herunter.
                    </p>
                    <ExportDataButton />
                </div>
            </div>
        </div>
    )
}
