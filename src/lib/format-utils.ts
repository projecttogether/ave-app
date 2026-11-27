export const LOCALE = 'de-DE';

export function formatCurrency(value: number | undefined | null, decimals: number = 2): string {
    if (value === undefined || value === null || isNaN(value)) return '-';
    return value.toLocaleString(LOCALE, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function formatPercentage(value: number | undefined | null): string {
    if (value === undefined || value === null || isNaN(value)) return '-';
    // Assuming value is already a percentage (0-100), not a fraction (0-1).
    // If typical input is 0.5 for 50%, we need to know.
    // Based on existing code: `row.plant_based_spend / row.total_food_spend * 100`, so input is 0-100.
    return value.toLocaleString(LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }) + '%';
}

export function formatNumber(value: number | undefined | null, decimals: number = 0): string {
    if (value === undefined || value === null || isNaN(value)) return '-';
    return value.toLocaleString(LOCALE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Parses user-inputted strings into numbers, intelligently handling English 
 * and German decimal/thousands separators.
 */
export function parseLocalNumber(input: string | null | undefined): number | null {
    if (!input) return null;
    let s = input.trim().replace(/[^0-9,.-]/g, '');
    if (!s) return null;

    const commaIndex = s.lastIndexOf(',');
    const dotIndex = s.lastIndexOf('.');
    
    const commaCount = (s.match(/,/g) || []).length;
    const dotCount = (s.match(/\./g) || []).length;

    if (commaCount > 1 && dotCount === 0) {
        // e.g. "5,000,000"
        s = s.replace(/,/g, '');
    } else if (dotCount > 1 && commaCount === 0) {
        // e.g. "5.000.000"
        s = s.replace(/\./g, '');
    } else if (commaCount === 1 && dotCount === 0) {
        // e.g. "5,000" or "5,5" -> Assume German decimal
        s = s.replace(',', '.');
    } else if (dotCount === 1 && commaCount === 0) {
        // e.g. "5.000" or "5.5"
        // If exactly 3 digits after dot, assume German thousands separator.
        if (/\.[0-9]{3}$/.test(s)) {
            s = s.replace('.', '');
        }
        // else leave as decimal dot
    } else if (commaCount > 0 && dotCount > 0) {
        if (commaIndex > dotIndex) {
            // "5.000,50" -> German
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // "5,000.50" -> English
            s = s.replace(/,/g, '');
        }
    }

    const num = parseFloat(s);
    return isNaN(num) ? null : num;
}
