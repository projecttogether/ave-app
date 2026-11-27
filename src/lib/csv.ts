/**
 * Escapes a value for a CSV cell.
 *
 * Text values starting with a spreadsheet formula trigger (= + - @ tab CR)
 * are prefixed with a single quote so they cannot execute as formulas when
 * the export is opened in Excel/LibreOffice/Sheets (CSV injection).
 * Values containing `;` or a line break are quoted as well: German Excel
 * splits on `;`, which would otherwise start an unescaped formula cell.
 * Numbers are emitted as-is; quoting/doubling follows RFC 4180.
 */
export function csvEscape(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return ''
    let str = String(value)
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`
    }
    if (/[,;"\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}
