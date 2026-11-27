'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { TachometerChart } from "./tachometer-chart"

interface ScoringPieChartProps {
    score: number
    target?: number
}

export function ScoringPieChart({ score, target = 100 }: ScoringPieChartProps) {
    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle className="text-sm font-medium">Auswertung der Scoring-Fragen</CardTitle>
                    <CardDescription className="text-xs mt-1">
                        Status der laufenden Aktivitäten
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex flex-1 items-center justify-center pb-4">
                <TachometerChart
                    value={score}
                    target={target}
                    max={100}
                    unit="Pkt."
                />
            </CardContent>
        </Card>
    )
}
