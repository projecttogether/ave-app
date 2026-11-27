import type { FormDataMap, QuestionConfig } from '@/lib/questions/types'

export type QuestionResponse = {
  questionKey: string
  responseText?: string | null
  responseOption?: string | null
  responseMultiple?: unknown
  responseDate?: Date | string | null
  responseNumber?: number | string | null
  responseBoolean?: boolean | null
}

export type QuestionState = {
  visible: boolean
  answered: boolean
  /** Visible and included in the selected completion rule. */
  required: boolean
  missing: boolean
}

export type QuestionnaireState = {
  byKey: Record<string, QuestionState>
  expectedCount: number
  answeredCount: number
  /** Answers to configured questions, including optional or currently hidden answers. */
  totalAnsweredCount: number
  missingKeys: string[]
  completeness: number
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (value instanceof Date) return Number.isFinite(value.getTime())
  return typeof value === 'boolean'
}

function hasMultipleAnswer(value: unknown): boolean {
  return Array.isArray(value) && value.some(isPresent)
}

function hasAnswer(answer: QuestionResponse | undefined): boolean {
  return !!answer && (
    isPresent(answer.responseText) ||
    isPresent(answer.responseOption) ||
    hasMultipleAnswer(answer.responseMultiple) ||
    isPresent(answer.responseDate) ||
    isPresent(answer.responseNumber) ||
    isPresent(answer.responseBoolean)
  )
}

/** Evaluate drafts and stored answers using the same visibility and completion rules. */
export function evaluateQuestionnaire(
  questions: readonly QuestionConfig[],
  answers: FormDataMap | readonly QuestionResponse[],
  options: { includeOptional?: boolean } = {},
): QuestionnaireState {
  const responses: readonly QuestionResponse[] = Array.isArray(answers)
    ? answers
    : Object.entries(answers as FormDataMap).map(([questionKey, answer]) => ({
      questionKey,
      responseText: answer.text,
      responseOption: answer.option,
      responseMultiple: answer.multiple,
      responseDate: answer.date,
    }))
  const answersByKey = new Map(responses.map(answer => [answer.questionKey, answer]))
  const questionsByKey = new Map(questions.map(question => [question.key, question]))
  const byKey: Record<string, QuestionState> = {}
  const resolving = new Set<string>()

  function stateFor(question: QuestionConfig): QuestionState {
    if (Object.hasOwn(byKey, question.key)) return byKey[question.key]
    let visible = !question.dependsOn

    if (question.dependsOn && !resolving.has(question.key)) {
      resolving.add(question.key)
      const parent = questionsByKey.get(question.dependsOn)
      const parentAnswer = answersByKey.get(question.dependsOn)
      if (parent && stateFor(parent).visible) {
        visible = parent.options?.includes('Ja')
          ? parentAnswer?.responseOption?.trim() === 'Ja'
          : parent.type === 'multiple-choice'
            ? hasMultipleAnswer(parentAnswer?.responseMultiple)
            : hasAnswer(parentAnswer)
      }
      resolving.delete(question.key)
    }

    const answered = hasAnswer(answersByKey.get(question.key))
    const required = visible && (!question.optional || !!options.includeOptional)
    const state = { visible, answered, required, missing: required && !answered }
    byKey[question.key] = state
    return state
  }

  let expectedCount = 0
  let answeredCount = 0
  const missingKeys: string[] = []
  for (const question of questions) {
    const state = stateFor(question)
    if (state.required) {
      expectedCount++
      if (state.answered) answeredCount++
    }
    if (state.missing) missingKeys.push(question.key)
  }

  return {
    byKey,
    expectedCount,
    answeredCount,
    totalAnsweredCount: Object.values(byKey).filter(state => state.answered).length,
    missingKeys,
    completeness: expectedCount > 0 ? Math.round(answeredCount / expectedCount * 100) : 0,
  }
}
