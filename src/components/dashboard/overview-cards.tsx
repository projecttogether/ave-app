"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardOverview } from '@/lib/indicators/types'
import { INDICATOR_LABELS } from '@/lib/indicators/indicators'
import { cn } from '@/lib/utils'

interface OverviewCardsProps {
    data: DashboardOverview
}

export function OverviewCards({ data }: OverviewCardsProps) {
    const cards = [
        {
            title: INDICATOR_LABELS['plant_based'],
            value: data.plant_based_percentage,
            suffix: '%',
            target: 75,
            description: 'Ziel: 75%',
            format: (v: number) => v.toFixed(1)
        },
        {
            title: INDICATOR_LABELS['organic'],
            value: data.organic_percentage,
            suffix: '%',
            target: 40,
            description: 'Ziel: 40%',
            format: (v: number) => v.toFixed(1)
        },
        {
            title: INDICATOR_LABELS['fair_trade'],
            value: data.fair_trade_percentage,
            suffix: '%',
            target: 90, // For Coffee/Cocoa/Bananas logic
            description: 'Ziel: 90% (Kaffee/Kakao/Bananen/Kakao-Misch.)',
            format: (v: number) => v.toFixed(1)
        },
        {
            title: INDICATOR_LABELS['food_waste'],
            value: data.food_waste,
            suffix: ' kg',
            target: 0,
            description: 'Gesamtabfall',
            format: (v: number) => v.toLocaleString('de-DE')
        },
        {
            title: INDICATOR_LABELS['regional'],
            value: data.regional_scoring_result,
            suffix: ' Pkt.',
            target: 20,
            description: 'Ziel: 20 Punkte',
            format: (v: number) => v.toFixed(1)
        },
        {
            title: INDICATOR_LABELS['seasonal'],
            value: data.seasonal_scoring_result,
            suffix: ' Pkt.',
            target: 60,
            description: 'Ziel: 60 Punkte',
            format: (v: number) => v.toFixed(1)
        },
        {
            title: INDICATOR_LABELS['guest_satisfaction'],
            value: data.guest_satisfaction_scoring_result,
            suffix: ' Pkt.',
            target: 75,
            description: 'Ziel: 75 Punkte',
            format: (v: number) => v.toFixed(1)
        }
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => {
                const isPercentage = card.suffix === '%'
                // Simple red/green logic logic for demo (refined later)
                const isOnTrack = !card.target ? true : (card.value !== null && card.value >= card.target)

                // Food waste is reverse (lower is better), but we don't have a specific target in number yet, just "-30%".
                // So skipping color logic for waste for now.

                return (
                    <Card key={card.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {card.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-2xl font-bold",
                                isPercentage && card.target && (isOnTrack ? "text-green-600" : "text-amber-600")
                            )}>
                                {card.value === null ? 'Keine Daten' : `${card.format(card.value)}${card.suffix}`}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {card.description}
                            </p>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
