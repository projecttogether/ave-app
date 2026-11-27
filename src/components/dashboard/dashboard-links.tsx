"use client"

import { useState, useTransition } from "react"
import { DashboardLink, saveDashboardLinks } from "@/app/actions/links"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, Plus, Trash2, ArrowRight, ExternalLink } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"

export function DashboardLinks({
    initialLinks = [],
    isAdmin = false
}: {
    initialLinks?: DashboardLink[],
    isAdmin?: boolean
}) {
    const [links, setLinks] = useState<DashboardLink[]>(initialLinks)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl">Links</CardTitle>
                    <CardDescription>
                        Wichtige Verknüpfungen und Ressourcen
                    </CardDescription>
                </div>
                {isAdmin && (
                    <EditLinksModal 
                        links={links} 
                        onSave={(newLinks) => {
                            setLinks(newLinks)
                            setIsEditModalOpen(false)
                        }}
                        open={isEditModalOpen}
                        onOpenChange={setIsEditModalOpen}
                    />
                )}
            </CardHeader>
            <CardContent className="pt-4 flex-1">
                {links.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                        <ExternalLink className="h-8 w-8 mb-4 text-muted-foreground/50" />
                        <p>Noch keine Links vorhanden.</p>
                        {isAdmin && (
                            <Button 
                                variant="link" 
                                onClick={() => setIsEditModalOpen(true)}
                                className="mt-2"
                            >
                                Links hinzufügen
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {links.map((link) => (
                            <Link 
                                key={link.id} 
                                href={link.url}
                                target={link.url.startsWith('http') ? '_blank' : undefined}
                                rel={link.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                                className="group relative"
                            >
                                <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary hover:bg-muted/30 transition-all duration-200">
                                    <span className="font-medium truncate pr-4 text-sm">{link.name}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function EditLinksModal({
    links,
    onSave,
    open,
    onOpenChange
}: {
    links: DashboardLink[],
    onSave: (links: DashboardLink[]) => void,
    open: boolean,
    onOpenChange: (open: boolean) => void
}) {
    const [editedLinks, setEditedLinks] = useState<DashboardLink[]>(links)
    const [isPending, startTransition] = useTransition()

    // Reset when opened
    const handleOpenChange = (newOpen: boolean) => {
        if (newOpen) {
            setEditedLinks([...links])
        }
        onOpenChange(newOpen)
    }

    const handleAdd = () => {
        setEditedLinks([
            ...editedLinks,
            { id: crypto.randomUUID(), name: '', url: '' }
        ])
    }

    const handleRemove = (id: string) => {
        setEditedLinks(editedLinks.filter(l => l.id !== id))
    }

    const handleChange = (id: string, field: 'name' | 'url', value: string) => {
        setEditedLinks(editedLinks.map(l => 
            l.id === id ? { ...l, [field]: value } : l
        ))
    }

    const { toast } = useToast()

    const handleSave = () => {
        // Basic validation: filter out empty names or urls
        const validLinks = editedLinks.filter(l => l.name.trim() !== '' && l.url.trim() !== '')

        startTransition(async () => {
            try {
                await saveDashboardLinks(validLinks)
                toast({ title: "Links erfolgreich gespeichert." })
                onSave(validLinks)
            } catch (error) {
                console.error("Failed to save links:", error)
                toast({ title: "Fehler beim Speichern der Links.", variant: "destructive" })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="sr-only">Links bearbeiten</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Links bearbeiten</DialogTitle>
                    <DialogDescription>
                        Hier können Admins die Liste der Schnellverknüpfungen auf dem Dashboard verwalten.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 py-4 space-y-4">
                    {editedLinks.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Keine Links vorhanden. Klicke auf &quot;Link hinzufügen&quot;.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {editedLinks.map((link) => (
                                <div key={link.id} className="flex gap-3 items-end p-3 border rounded-md bg-muted/10">
                                    <div className="flex-1 space-y-2">
                                        <div className="space-y-1">
                                            <Label htmlFor={`name-${link.id}`} className="text-xs">Name</Label>
                                            <Input 
                                                id={`name-${link.id}`}
                                                placeholder="z.B. Glide Portal" 
                                                value={link.name}
                                                onChange={(e) => handleChange(link.id, 'name', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor={`url-${link.id}`} className="text-xs">URL</Label>
                                            <Input 
                                                id={`url-${link.id}`}
                                                placeholder="https://..." 
                                                value={link.url}
                                                onChange={(e) => handleChange(link.id, 'url', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="pb-1">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleRemove(link.id)}
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            title="Link löschen"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-start pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={handleAdd} className="gap-1">
                        <Plus className="h-4 w-4" /> Link hinzufügen
                    </Button>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="ghost" onClick={() => handleOpenChange(false)}>Abbrechen</Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? "Speichern..." : "Speichern"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
