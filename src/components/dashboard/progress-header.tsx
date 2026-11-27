'use client'

interface ProgressHeaderProps {
    showProgress?: boolean
    progress: {
        total_entries: number
        expected_entries: number
        percentage: number
    }
}

export function ProgressHeader({
    showProgress = true,
    progress,
}: ProgressHeaderProps) {
    if (!showProgress) return null
    const pct = Math.min(100, Math.max(0, progress.percentage))

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-card p-4 rounded-lg border shadow-sm">
            <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fortschritt der Datenerfassung</span>
                    <span>{progress.expected_entries > 0 ? Math.round((progress.total_entries / progress.expected_entries) * 12) : 0} / 12 Monate</span>
                </div>
                <div className="h-4 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-in-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    )
}
