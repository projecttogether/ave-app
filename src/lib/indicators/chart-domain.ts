export function indicatorChartDomain(values: (number | null)[], target?: number) {
    const present = values.filter((value): value is number => value !== null && Number.isFinite(value))
    if (target !== undefined && Number.isFinite(target)) present.push(target)
    const min = Math.min(0, ...present)
    const max = Math.max(0, ...present)
    const padding = Math.max((max - min) * 0.1, 5)
    return { min: min < 0 ? Math.floor((min - padding) / 5) * 5 : 0, max: Math.ceil((max + padding) / 5) * 5 }
}
