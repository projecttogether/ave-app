import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { canEnterReflection } from '@/lib/roles'
import { ReflectionEntryForm } from "@/components/form/reflection-entry-form"
import { getAppContent } from "@/lib/content/content"
import { Metadata } from "next"
import { EditableText } from "@/components/editable-text"

export const metadata: Metadata = {
    title: "Reflexionsfragen – Datenerfassung",
}

export default async function ReflectionQuestionsPage() {
    const session = await auth()

    if (!session?.user?.email) {
        redirect('/login')
    }

    const roles = (session.user as any).roles

    // Only managers and admins can access reflection questions
    if (!canEnterReflection(roles)) {
        redirect('/dashboard')
    }

    const content = await getAppContent()

    return (
        <div className="space-y-6 mt-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Reflexionsfragen erfassen</h2>
                <p className="text-muted-foreground">
                  <EditableText contentKey="page.forms.reflection.subtitle" initialValue={content['page.forms.reflection.subtitle'] || 'Reflektieren Sie über den Prozess und die Ergebnisse der Datenerfassung.'} isTextarea>
                    {content['page.forms.reflection.subtitle'] || 'Reflektieren Sie über den Prozess und die Ergebnisse der Datenerfassung.'}
                  </EditableText>
                </p>
            </div>
            <ReflectionEntryForm />
        </div>
    )
}

