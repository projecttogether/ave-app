import Link from "next/link"
import { ClipboardEdit, ListChecks, BookOpenText } from "lucide-react"
import { Metadata } from "next"
import { auth } from "@/auth"
import { canEnterReflection } from "@/lib/roles"

export const metadata: Metadata = {
    title: "Datenerfassung",
}

const formPages = [
    {
        title: "Betriebsdaten",
        description: "Betriebsdaten und Einkaufszahlen erfassen.",
        href: "/form/operating",
        icon: ClipboardEdit,
    },
    {
        title: "Scoring-Fragen",
        description: "Qualitative Bewertungsfragen beantworten.",
        href: "/form/scoring",
        icon: ListChecks,
    },
    {
        title: "Reflexionsfragen",
        description: "Reflexionsfragen zur Nachhaltigkeit beantworten.",
        href: "/form/reflection",
        icon: BookOpenText,
        managerOnly: true,
    },
]

export default async function FormIndexPage(props: {
    searchParams: Promise<{ year?: string }>
}) {
    const searchParams = await props.searchParams
    const session = await auth()
    const roles = (session?.user as any)?.roles || []
    const yearParam = searchParams.year ? parseInt(searchParams.year, 10) : undefined
    const yearQuery = Number.isFinite(yearParam) ? `?year=${yearParam}` : ''
    const visibleFormPages = formPages.filter((page) => !page.managerOnly || canEnterReflection(roles))

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Datenerfassung</h2>
                <p className="text-muted-foreground">
                    Wählen Sie einen Bereich zur Dateneingabe.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {visibleFormPages.map((page) => (
                    <Link
                        key={page.href}
                        href={`${page.href}${yearQuery}`}
                        className="group rounded-lg border p-6 hover:border-primary hover:bg-accent transition-colors"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <page.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            <h3 className="font-semibold group-hover:text-primary transition-colors">
                                {page.title}
                            </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {page.description}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
