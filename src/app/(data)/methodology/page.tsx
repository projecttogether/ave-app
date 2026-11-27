"use client"

import { INDICATORS } from '@/lib/indicators/indicators'
import { INDICATOR_METHODOLOGIES } from '@/lib/indicators/methodology'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Target, Calculator, Database, Info } from 'lucide-react'
import { useContent } from '@/components/providers/content-provider'
import { EditableText } from '@/components/editable-text'

export default function MethodologyPage() {
    const t = useContent()

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{t('methodology.title')}</h2>
                <p className="text-muted-foreground">
                    <EditableText contentKey="methodology.description" initialValue={t('methodology.description')} isTextarea>
                        {t('methodology.description')}
                    </EditableText>
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {INDICATORS.map((indicator) => {
                    const methodology = INDICATOR_METHODOLOGIES.find(
                        (m) => m.indicatorId === indicator.id,
                    )

                    if (!methodology) return null

                    return (
                        <Card key={indicator.id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">
                                        {t(`indicator.${indicator.id}`) || indicator.name}
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                            <Target className="mr-1 h-3 w-3" />
                                            {t(`indicator.${indicator.id}.target`) || `Ziel: ${indicator.target}${indicator.unit}`}
                                        </Badge>
                                    </div>
                                </div>

                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Formula */}
                                <div className="flex gap-3">
                                    <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium mb-1">
                                            {t('methodology.label.formula') || "Berechnungsformel"}
                                        </p>
                                        <p className="text-sm text-muted-foreground font-mono bg-muted px-3 py-2 rounded-md">
                                            <EditableText contentKey={`methodology.${indicator.id}.formula`} initialValue={t(`methodology.${indicator.id}.formula`) || methodology.formula}>
                                                {t(`methodology.${indicator.id}.formula`) || methodology.formula}
                                            </EditableText>
                                        </p>
                                    </div>
                                </div>

                                {/* Data source */}
                                <div className="flex gap-3">
                                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium mb-1">
                                            {t('methodology.label.source') || "Datenquelle"}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            <EditableText contentKey={`methodology.${indicator.id}.source`} initialValue={t(`methodology.${indicator.id}.source`) || methodology.dataSource}>
                                                {t(`methodology.${indicator.id}.source`) || methodology.dataSource}
                                            </EditableText>
                                        </p>
                                    </div>
                                </div>

                                {/* Notes */}
                                {((t(`methodology.${indicator.id}.notes`) || methodology.notes.join('\n')).trim().length > 0) && (
                                    <div className="flex gap-3">
                                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium mb-1">
                                                {t('methodology.label.notes') || "Hinweise"}
                                            </p>
                                            <EditableText contentKey={`methodology.${indicator.id}.notes`} initialValue={t(`methodology.${indicator.id}.notes`) || methodology.notes.join('\n')} isTextarea>
                                                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                                    {(t(`methodology.${indicator.id}.notes`) || methodology.notes.join('\n'))
                                                        .split('\n')
                                                        .filter(Boolean)
                                                        .map((note, i) => (
                                                            <li key={i}>{note}</li>
                                                        ))}
                                                </ul>
                                            </EditableText>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
