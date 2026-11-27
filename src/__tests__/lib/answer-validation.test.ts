import { describe, expect, it } from 'vitest'
import { MAX_ANSWER_TEXT, validateAnswers } from '@/lib/questions/validation'
import type { QuestionConfig } from '@/lib/questions/types'

const questions: QuestionConfig[] = [
  { key: 'single', label: 'Single', type: 'single-select', options: ['Ja', 'Nein'], group: '', indicator: 'organic', order: 1 },
  { key: 'many', label: 'Many', type: 'multiple-choice', options: ['A', 'B'], group: '', indicator: 'organic', order: 2 },
  { key: 'notes', label: 'Notes', type: 'long text', group: '', indicator: 'organic', order: 3 },
  { key: 'when', label: 'When', type: 'date', group: '', indicator: 'organic', order: 4 },
]
const empty = { text: '', option: '', multiple: [], date: '' }

describe('questionnaire answers from Server Actions', () => {
  it('accepts the shapes the forms send and drops unknown questions', () => {
    const result = validateAnswers(questions, {
      single: { ...empty, option: 'Ja' }, many: { ...empty, multiple: ['A', 'B'] }, notes: { ...empty, text: 'Freitext' },
      when: { ...empty, date: '01.02.2026' }, unknown: { text: 'ignored' },
    })
    expect('data' in result && Object.keys(result.data)).toEqual(['single', 'many', 'notes', 'when'])
  })
  it.each([
    ['an unknown single option', { single: { option: 'Vielleicht' } }],
    ['an unknown multiple option', { many: { multiple: ['A', 'C'] } }],
    ['an option on a text question', { notes: { option: 'Ja' } }],
    ['oversized text', { notes: { text: 'x'.repeat(MAX_ANSWER_TEXT + 1) } }],
    ['a non-string value', { notes: { text: { nested: true } } }],
    ['a malformed date', { when: { date: '2026-02-01' } }],
    ['too many selections', { many: { multiple: Array(51).fill('A') } }],
  ])('rejects %s', (_, data) => {
    expect(validateAnswers(questions, data)).toHaveProperty('error')
  })
  it('rejects non-object payloads', () => {
    for (const data of [null, 'text', [], 42]) expect(validateAnswers(questions, data)).toHaveProperty('error')
  })
})
