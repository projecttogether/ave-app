'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TachometerChart } from './tachometer-chart'
import { TrendingUp } from 'lucide-react'

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface KPICardProps {
    title: string
    value: number | null | undefined
    unit: string
    target?: number
    max?: number
    prevPeriodChange?: number
    href?: string
}

export function KPICard({
    title,
    value,
    unit,
    target,
    max = 100,
    prevPeriodChange: _prevPeriodChange,
    href
}: KPICardProps) {

    const inner = (
        <Card className={cn("h-full flex flex-col", href && "hover:border-primary/50 transition-colors cursor-pointer")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle className="text-sm font-medium">
                        {title}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Status Quo</CardDescription>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-1 items-center justify-center pb-4">
                <TachometerChart
                    value={value}
                    target={target}
                    max={max}
                    unit={unit}
                />
            </CardContent>
        </Card>
    )

    if (href) {
        return (
            <Link href={href} className="block h-full">
                {inner}
            </Link>
        )
    }

    return inner
}
