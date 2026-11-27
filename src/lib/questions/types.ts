// Shared types for qualitative question configuration
// Used by both scoring (qualitative_responses) and reflexion (intake_responses) questions

import type { Indicator } from '@/lib/indicators/indicators'

export type QuestionType = 'long text' | 'short text' | 'single-select' | 'multiple-choice' | 'date'

export interface QuestionConfig {
  key: string
  label: string
  type: QuestionType
  options?: string[]
  group: string
  indicator: string
  order: number
  dependsOn?: string  // Ja/Nein parents require "Ja"; other parents require an answer
  optional?: boolean  // if true, this question does not count towards missing scoring tasks
  /** Auto-computed hierarchical numbering, e.g. "1.3" or "1.3.1" */
  numbering?: string
}

// Shared response value shape for form data
export interface ResponseValue {
  text?: string
  option?: string
  multiple?: string[]
  date?: string  // DD.MM.YYYY format
}

// Form data keyed by question key
export type FormDataMap = Record<string, ResponseValue>

// Helper: group questions by indicator, then by group
export function groupQuestionsByIndicator(questions: QuestionConfig[]) {
  const byIndicator = new Map<string, Map<string, QuestionConfig[]>>()
  const questionsByKey = new Map(questions.map((question) => [question.key, question]))

  for (const q of questions) {
    if (!byIndicator.has(q.indicator)) {
      byIndicator.set(q.indicator, new Map())
    }
    const groups = byIndicator.get(q.indicator)!

    const parent = q.dependsOn ? questionsByKey.get(q.dependsOn) : undefined
    const groupName = parent?.indicator === q.indicator ? parent.group : q.group

    if (!groups.has(groupName)) {
      groups.set(groupName, [])
    }
    groups.get(groupName)!.push(q)
  }

  // Sort questions within each group by order
  for (const groups of byIndicator.values()) {
    for (const [groupName, questions] of groups) {
      groups.set(groupName, questions.sort((a, b) => a.order - b.order))
    }
  }

  return byIndicator
}

/**
 * Assigns hierarchical numbering to each question:
 * - Top-level questions (no dependsOn): "<indicatorOrder>.<questionIndex>"  e.g. "1.3"
 * - Dependent sub-questions (dependsOn set): "<indicatorOrder>.<parentIndex>.<subIndex>"  e.g. "1.3.1"
 *
 * The indicator order is looked up from the `indicators` master list.
 * Questions within each indicator are numbered in insertion order.
 */
export function computeQuestionNumberings(
  questions: QuestionConfig[],
  indicators: readonly Indicator[],
): QuestionConfig[] {
  // Build indicator order map: slug -> order number
  const indicatorOrder = new Map<string, number>(indicators.map((i) => [i.id, i.order]))

  // Group questions by indicator, preserving insertion order
  const byIndicator = new Map<string, QuestionConfig[]>()
  for (const q of questions) {
    if (!byIndicator.has(q.indicator)) byIndicator.set(q.indicator, [])
    byIndicator.get(q.indicator)!.push(q)
  }

  // Build a map of question key -> numbering
  const numberingMap = new Map<string, string>()

  for (const [slug, qs] of byIndicator) {
    const indNum = indicatorOrder.get(slug) ?? 0

    // Track parent numbering for sub-question counting
    // We iterate in order and assign top-level numbers first, then handle dependsOn
    let topLevelCounter = 0
    // map from parent key -> sub-counter
    const subCounters = new Map<string, number>()

    for (const q of qs) {
      if (!q.dependsOn) {
        topLevelCounter++
        const num = `${indNum}.${topLevelCounter}`
        numberingMap.set(q.key, num)
      } else {
        // sub-question: inherits parent numbering
        const parentNum = numberingMap.get(q.dependsOn)
        const subIdx = (subCounters.get(q.dependsOn) ?? 0) + 1
        subCounters.set(q.dependsOn, subIdx)
        const num = parentNum ? `${parentNum}.${subIdx}` : ''
        numberingMap.set(q.key, num)
      }
    }
  }

  return questions.map((q) => ({ ...q, numbering: numberingMap.get(q.key) ?? '' }))
}
