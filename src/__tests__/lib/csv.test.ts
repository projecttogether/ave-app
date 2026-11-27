import { describe, it, expect } from 'vitest'
import { csvEscape } from '@/lib/csv'

describe('csvEscape', () => {
    it('returns empty string for null/undefined', () => {
        expect(csvEscape(null)).toBe('')
        expect(csvEscape(undefined)).toBe('')
    })

    it('passes plain text through unchanged', () => {
        expect(csvEscape('Mensa Nord')).toBe('Mensa Nord')
    })

    it('quotes values containing commas, quotes or newlines', () => {
        expect(csvEscape('a,b')).toBe('"a,b"')
        expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
        expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    })

    it('neutralizes formula triggers at the start of text values', () => {
        expect(csvEscape('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"')
        expect(csvEscape('=1+2')).toBe("'=1+2")
        expect(csvEscape('+49 123')).toBe("'+49 123")
        expect(csvEscape('-foo')).toBe("'-foo")
        expect(csvEscape('@cmd')).toBe("'@cmd")
        expect(csvEscape('\tx')).toBe("'\tx")
    })

    it('does not prefix numbers, including negatives', () => {
        expect(csvEscape(-5)).toBe('-5')
        expect(csvEscape(150.5)).toBe('150.5')
        expect(csvEscape(0)).toBe('0')
    })

    it('quotes semicolons and carriage returns so no cell can start unescaped', () => {
        expect(csvEscape("ok;=cmd|' /C calc'!A0")).toBe(`"ok;=cmd|' /C calc'!A0"`)
        expect(csvEscape('a\rb')).toBe('"a\rb"')
    })
})
