import { decimal } from './decimal'

export const INPUT_LABELS = {
    totalFoodSpend: 'Gesamteinkauf Lebensmittel', meatSpend: 'Fleisch', fishSpend: 'Fisch',
    dairySpend: 'Milchprodukte', eggSpend: 'Eier', mixedProductSpend: 'Mischprodukte',
    organicSpend: 'Bio-Einkauf', coffeeSpend: 'Kaffee gesamt', cocoaSpend: 'Kakao gesamt',
    bananasSpend: 'Bananen gesamt', cocoaMixedSpend: 'Kakaomischprodukte gesamt',
    fairTradeCoffeeSpend: 'Fairtrade-Kaffee', fairTradeCocoaSpend: 'Fairtrade-Kakao',
    fairTradeBananasSpend: 'Fairtrade-Bananen', fairTradeCocoaMixedSpend: 'Fairtrade-Kakaomischprodukte',
    foodWasteAmount: 'Abfallmenge',
} as const
export type InputField = keyof typeof INPUT_LABELS
export const INPUT_FIELDS = Object.keys(INPUT_LABELS) as InputField[]
export const CERTIFIED_PAIRS: [InputField, InputField][] = [
    ['fairTradeCoffeeSpend', 'coffeeSpend'], ['fairTradeCocoaSpend', 'cocoaSpend'],
    ['fairTradeBananasSpend', 'bananasSpend'], ['fairTradeCocoaMixedSpend', 'cocoaMixedSpend'],
    ['organicSpend', 'totalFoodSpend'],
]
export type InputIssue = { field: string; message: string }
export const isBlank = (value: unknown) => value === null || value === undefined || value === ''

/** Canonical decimals, at most six fractional digits. Credits must be netted
 * against the same category/period; the reported net amount cannot be negative. */
export function validateAmount(value: unknown, field: string, label: string): InputIssue | null {
    if (isBlank(value)) return null
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        !/^\d+(?:\.\d{1,6})?$/.test(String(value)) || !Number.isFinite(Number(value)) || decimal(value).gt('1000000000000')) {
        return { field, message: `${label}: Bitte eine Zahl zwischen 0 und 1.000.000.000.000 mit höchstens 6 Nachkommastellen eingeben. Gutschriften innerhalb derselben Kategorie und Periode verrechnen. CSV-Zahlen benötigen einen Dezimalpunkt ohne Tausendertrennzeichen.` }
    }
    return null
}

export function validateIndicatorInput(row: Record<string, unknown>): InputIssue[] {
    const issues: InputIssue[] = []
    for (const field of INPUT_FIELDS) {
        const issue = validateAmount(row[field], field, INPUT_LABELS[field])
        if (issue) issues.push(issue)
    }
    if (issues.length) return issues
    for (const [part, total] of CERTIFIED_PAIRS) {
        if (!isBlank(row[part]) && (isBlank(row[total]) || decimal(row[part]).gt(decimal(row[total])))) {
            issues.push({ field: part, message: `${INPUT_LABELS[part]} benötigt ${INPUT_LABELS[total]} und darf diesen Betrag nicht übersteigen.` })
        }
    }
    const animalFields: InputField[] = ['meatSpend', 'fishSpend', 'dairySpend', 'eggSpend', 'mixedProductSpend']
    if (animalFields.some(field => !isBlank(row[field]))) {
        const sum = animalFields.reduce((total, field) => total.plus(decimal(row[field])), decimal(0))
        if (isBlank(row.totalFoodSpend) || sum.gt(decimal(row.totalFoodSpend))) {
            issues.push({ field: 'totalFoodSpend', message: 'Der Gesamteinkauf muss angegeben werden und mindestens der Summe aus Fleisch, Fisch, Milchprodukten, Eiern und Mischprodukten entsprechen. Kategorien ohne Überschneidungen erfassen.' })
        }
    }
    return issues
}

export function normalizeIndicatorInput(row: Record<string, unknown>): Partial<Record<InputField, string | null>> {
    return Object.fromEntries(INPUT_FIELDS.filter(field => field in row).map(field => [field, isBlank(row[field]) ? null : decimal(row[field]).toFixed()]))
}
