export type { QualitativeFormData } from './constants'
import { INDICATOR_SLUGS, type IndicatorSlug } from './constants'
import type { QualitativeFormData } from './constants'
import { parseLocalNumber } from '../format-utils'
import { FORMULA_POLICY } from '../indicators/policy'
import { decimal, roundCalculation } from '../indicators/decimal'

export type QualitativeScores = Record<IndicatorSlug, number | null>
export const EMPTY_QUALITATIVE_SCORES: QualitativeScores = {
    plant_based: null, organic: null, food_waste: null, seasonal: null,
    regional: null, fair_trade: null, guest_satisfaction: null,
}

export function aggregateQualitativeScores(rows: { subOrganizationId: string; indicatorSlug: string; questionKey: string; responseOption: string | null }[]): QualitativeScores {
    const result = { ...EMPTY_QUALITATIVE_SCORES }
    for (const slug of INDICATOR_SLUGS) {
        const groups = new Map<string, QualitativeFormData>()
        for (const row of rows.filter(row => row.indicatorSlug === slug)) {
            const answers = groups.get(row.subOrganizationId) ?? {}
            answers[row.questionKey] = { option: row.responseOption ?? '' }
            groups.set(row.subOrganizationId, answers)
        }
        const scores = [...groups.values()].map(answers => calculateScoreForIndicator(answers, slug)).filter((score): score is number => score !== null)
        if (scores.length) result[slug] = roundCalculation(decimal(scores.reduce((sum, score) => sum + score, 0)).div(scores.length).toNumber(), 0)
    }
    return result
}

/**
 * Calculates a normalized score (0-100) for a given indicator based on its qualitative responses.
 * 
 * Logic mapping:
 * - Yes/No/Planned: Ja = 2, Geplant = 1, Nein = 0, Unklar = 0 (max 2)
 * - Percentage estimates: <10% = 1, 11-25% = 2, 26-50% = 3, 51-75% = 4, 76-100% = 5, Unklar = 0 (max 5)
 * - Frequency: nie = 0, jährlich = 1, halbjährlich = 2, quartalsweise = 3, monatlich = 4, wöchentlich = 5, täglich = 6 (max 6)
 * - Score is returned as `(totalPoints / maxPoints) * 100` rounded to 0 decimal places.
 * - If no relevant questions are answered, returns `null`.
 * - 'Unklar' counts as an answered question but contributes 0 points.
 */
export function calculateScoreForIndicator(data: QualitativeFormData, indicatorSlug: string): number | null {
    const questions = FORMULA_POLICY.questions.filter(q => q.indicator === indicatorSlug)
    let totalPoints = 0
    let maxPoints = 0
    let answeredCount = 0
    for (const q of questions) {
        maxPoints += q.maxPoints
        const answer = data[q.key]?.option
        const points = q.points as Record<string, number | undefined>
        if (answer && Object.prototype.hasOwnProperty.call(points, answer)) {
            answeredCount++
            totalPoints += points[answer]!
        }
    }
    if (maxPoints === 0 || answeredCount === 0) return null
    return roundCalculation(decimal(totalPoints).times(100).div(maxPoints).toNumber(), 0)
}

export function calculateRegionalScore(data: QualitativeFormData): number | null {
    return calculateScoreForIndicator(data, 'regional');
}

export function calculateSeasonalScore(data: QualitativeFormData): number | null {
    return calculateScoreForIndicator(data, 'seasonal');
}

export function calculateGuestSatisfactionScore(data: QualitativeFormData): number | null {
    return calculateScoreForIndicator(data, 'guest_satisfaction');
}

export function extractFoodWasteAmount(data: QualitativeFormData): number | null {
    const wasteQuestionKey = 'fw_score_current_waste_amount';
    const answer = data[wasteQuestionKey];
    if (answer && answer.text) {
        return parseLocalNumber(answer.text);
    }
    return null;
}
