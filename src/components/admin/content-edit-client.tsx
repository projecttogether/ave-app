"use client"

import { useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Save, ArrowLeft } from "lucide-react"
import { updateAppContent } from "@/app/admin/actions/content"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface ContentItem {
  key: string
  label: string
  value: string
  isTextarea?: boolean
}

interface ContentEditClientProps {
  pageTitle: string
  description: string
  items: ContentItem[]
}

export function ContentEditClient({ pageTitle, description, items }: ContentEditClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, string>>(
    items.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {})
  )
  const [isPending, setIsPending] = useState(false)

  const handleSave = async () => {
    setIsPending(true)
    let hasError = false
    
    // Save all changed items
    for (const item of items) {
      if (formData[item.key] !== item.value) {
        const result = await updateAppContent(item.key, formData[item.key])
        if (result?.error) {
          hasError = true
          toast({ title: "Fehler beim Speichern", description: `Fehler bei: ${item.key}`, variant: "destructive" })
        }
      }
    }

    if (!hasError) {
      toast({ title: "Erfolgreich gespeichert", description: "Alle Inhalte wurden aktualisiert." })
      router.refresh()
    }
    
    setIsPending(false)
  }

  const hasChanges = items.some(item => formData[item.key] !== item.value)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
        <Link href="/admin/content">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Übersicht
        </Link>
      </Button>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
          <p className="text-muted-foreground mt-2">{description}</p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || isPending}>
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Änderungen speichern
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inhalte bearbeiten</CardTitle>
          <CardDescription>Die Änderungen sind sofort nach dem Speichern für alle Nutzer sichtbar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {items.map((item) => (
            <div key={item.key} className="space-y-2 border-b pb-6 last:border-0 last:pb-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                <Label htmlFor={item.key} className="text-base font-medium">{item.label}</Label>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">{item.key}</span>
              </div>
              {item.isTextarea ? (
                <Textarea
                  id={item.key}
                  value={formData[item.key]}
                  onChange={(e) => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                  className="min-h-[100px] font-sans"
                />
              ) : (
                <Input
                  id={item.key}
                  value={formData[item.key]}
                  onChange={(e) => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
