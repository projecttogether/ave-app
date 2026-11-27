import { describe, expect, it } from 'vitest'
import { parse } from 'csv-parse/sync'
import { serializeReflectionCsv } from '@/lib/datasets/csv'

describe('reflection CSV', () => {
  it('preserves full answers and all response types, and escapes spreadsheet formulas', () => {
    const text = '=SUM(1,2)\n"Ausführliche Antwort" ' + 'weiter '.repeat(100)
    const csv = serializeReflectionCsv([{
      id: 'response', organizationId: 'org', organization: { name: 'Küche, Berlin' },
      indicatorSlug: 'organic', questionKey: 'org_refl_bio_satisfaction_detail',
      responseType: 'text', responseText: text, responseOption: '4',
      responseMultiple: ['Preis', 'Verfügbarkeit'], responseDate: new Date('2026-01-02T00:00:00Z'),
      responseNumber: '0', responseBoolean: false,
      createdAt: null, updatedAt: null, createdBy: null, updatedBy: null,
    }])
    const rows = parse<Record<string, string>>(csv, { columns: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      Organisation: 'Küche, Berlin',
      Frage: 'Beschreibe kurz, wie du zu dieser Einschätzung kommst:',
      'Antwort (Text)': "'" + text,
      'Antwort (Auswahl)': '4',
      'Antwort (Mehrfach)': 'Preis, Verfügbarkeit',
      'Antwort (Datum)': '2026-01-02T00:00:00.000Z',
      'Antwort (Zahl)': '0',
      'Antwort (Ja/Nein)': 'Nein',
    })
    expect(Object.keys(rows[0])).not.toContain('Organisations-ID')
    expect(Object.keys(rows[0])).not.toContain('Jahr')
    expect(Object.keys(rows[0])).not.toContain('Unterorganisation')
  })

  it('returns a header for an empty export', () => {
    expect(serializeReflectionCsv([])).toContain('Antwort (Text)')
    expect(parse(serializeReflectionCsv([]), { columns: true })).toEqual([])
  })
})
