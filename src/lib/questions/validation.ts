import { z } from 'zod'
import type { FormDataMap, QuestionConfig } from './types'

export const MAX_ANSWER_TEXT = 10_000

// Server Action arguments are untrusted: bound every answer before storing it.
const responseSchema = z.object({
  text: z.string().max(MAX_ANSWER_TEXT).nullish(),
  option: z.string().max(200).nullish(),
  multiple: z.array(z.string().max(200)).max(50).nullish(),
  date: z.string().regex(/^\d{1,2}\.\d{1,2}\.\d{4}$/).or(z.literal('')).nullish(),
})

/** Answers for the given questions only, each checked against its question's type and options. */
export function validateAnswers(questions: readonly QuestionConfig[], data: unknown): { data: FormDataMap } | { error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Ungültige Antworten' }
  const answers = data as Record<string, unknown>
  const valid: FormDataMap = {}
  for (const question of questions) {
    if (!Object.hasOwn(answers, question.key) || !answers[question.key]) continue
    const parsed = responseSchema.safeParse(answers[question.key])
    const invalid = { error: `Ungültige Antwort für ${question.label}` }
    if (!parsed.success) return invalid
    const answer = parsed.data
    if (answer.option && (question.type !== 'single-select' || !question.options?.includes(answer.option))) return invalid
    if (answer.multiple?.length && (question.type !== 'multiple-choice' || answer.multiple.some(value => !question.options?.includes(value)))) return invalid
    valid[question.key] = {
      text: answer.text ?? undefined, option: answer.option ?? undefined,
      multiple: answer.multiple ?? undefined, date: answer.date ?? undefined,
    }
  }
  return { data: valid }
}
