import { describe, expect, it } from 'vitest'
import { evaluateQuestionnaire, type QuestionResponse } from '@/lib/questions/completion'
import { SCORING_QUESTIONS } from '@/lib/qualitative/constants'
import { REFLECTION_QUESTIONS } from '@/lib/reflection/constants'
import { groupQuestionsByIndicator, type QuestionConfig, type ResponseValue } from '@/lib/questions/types'

const questions: QuestionConfig[] = [
  {
    key: 'uses_measure',
    label: 'Uses measure?',
    type: 'single-select',
    options: ['Ja', 'Nein'],
    group: 'Group',
    indicator: 'indicator',
    order: 1,
  },
  {
    key: 'measure_detail',
    label: 'Wenn ja, welche?',
    type: 'long text',
    group: 'Group',
    indicator: 'indicator',
    order: 2,
    dependsOn: 'uses_measure',
  },
  {
    key: 'always_required',
    label: 'Always required',
    type: 'long text',
    group: 'Group',
    indicator: 'indicator',
    order: 3,
  },
]

describe('question completion', () => {
  it('gives a draft and its stored answers the same state', () => {
    const draft = {
      uses_measure: { option: 'Ja', text: '', multiple: [], date: '' },
      measure_detail: { text: '   ', option: '', multiple: [], date: '' },
      always_required: { text: 'Done', option: '', multiple: [], date: '' },
    }
    const stored = [
      { questionKey: 'uses_measure', responseOption: 'Ja' },
      { questionKey: 'measure_detail', responseText: '   ' },
      { questionKey: 'always_required', responseText: 'Done' },
    ]
    expect(evaluateQuestionnaire(questions, draft)).toEqual(evaluateQuestionnaire(questions, stored))
    expect(evaluateQuestionnaire(questions, stored)).toMatchObject({
      expectedCount: 3, answeredCount: 2, completeness: 67, missingKeys: ['measure_detail'],
    })
  })

  it.each<Partial<QuestionResponse>>([
    {}, { responseText: '' }, { responseText: ' \n ' }, { responseOption: '' },
    { responseMultiple: [] }, { responseMultiple: ['', ' '] },
    { responseDate: '' }, { responseNumber: '' }, { responseNumber: Number.NaN },
  ])('does not count a blank answer: %j', response => {
    const result = evaluateQuestionnaire([questions[2]], [{ questionKey: 'always_required', ...response }])
    expect(result).toMatchObject({ answeredCount: 0, completeness: 0, missingKeys: ['always_required'] })
  })

  it.each<Partial<QuestionResponse>>([
    { responseNumber: 0 }, { responseNumber: '0' }, { responseBoolean: false },
  ])('preserves measured zero and false: %j', response => {
    const result = evaluateQuestionnaire([questions[2]], [{ questionKey: 'always_required', ...response }])
    expect(result).toMatchObject({ answeredCount: 1, completeness: 100, missingKeys: [] })
  })

  it('does not count hidden conditional questions as missing', () => {
    expect(evaluateQuestionnaire(questions, [
      { questionKey: 'uses_measure', responseOption: 'Nein' },
      { questionKey: 'always_required', responseText: 'Done' },
    ]).missingKeys).toEqual([])
  })

  it('counts visible conditional questions as missing', () => {
    expect(evaluateQuestionnaire(questions, [
      { questionKey: 'uses_measure', responseOption: 'Ja' },
      { questionKey: 'always_required', responseText: 'Done' },
    ]).missingKeys).toEqual(['measure_detail'])
  })

  it('retains hidden answers without counting them toward visible completion', () => {
    const result = evaluateQuestionnaire(questions, {
      uses_measure: { option: 'Nein' },
      measure_detail: { text: 'An earlier answer' },
      always_required: { text: 'Done' },
    })
    expect(result.byKey.measure_detail).toEqual({ visible: false, answered: true, required: false, missing: false })
    expect(result).toMatchObject({ expectedCount: 2, answeredCount: 2, totalAnsweredCount: 3, completeness: 100 })
  })

  it('does not make optional questions required merely because they are visible', () => {
    const config = [questions[0], { ...questions[1], optional: true }]
    const answers = { uses_measure: { option: 'Ja' } }
    const required = evaluateQuestionnaire(config, answers)
    expect(required.byKey.measure_detail).toEqual({ visible: true, answered: false, required: false, missing: false })
    expect(required).toMatchObject({ expectedCount: 1, answeredCount: 1, completeness: 100 })
    expect(evaluateQuestionnaire(config, answers, { includeOptional: true })).toMatchObject({
      expectedCount: 2, answeredCount: 1, completeness: 50, missingKeys: ['measure_detail'],
    })
  })

  it('completes the scoring questionnaire without optional details', () => {
    const answers = SCORING_QUESTIONS.filter(question => !question.optional).map(question => ({
      questionKey: question.key, responseOption: question.options?.[0] ?? null,
      responseText: question.options ? null : 'Answered',
    }))
    const result = evaluateQuestionnaire(SCORING_QUESTIONS, answers)
    expect(result).toMatchObject({ expectedCount: 95, answeredCount: 95, completeness: 100, missingKeys: [] })
    expect(result.byKey.pb_score_nudging_strategies_detail).toMatchObject({ visible: true, required: false })
  })

  it.each<[string, ResponseValue, string]>([
    ['org_refl_bio_satisfaction', { option: '3' }, 'org_refl_bio_satisfaction_detail'],
    ['fw_refl_satisfaction', { option: '1' }, 'fw_refl_satisfaction_detail'],
    ['org_refl_bio_potential_groups', { multiple: ['Gemüse & Obst'] }, 'org_refl_bio_potential_detail'],
    ['org_refl_bio_obstacles', { multiple: ['Preis'] }, 'org_refl_bio_obstacles_detail'],
  ])('reveals the reflection detail for %s', (parent, answer, detail) => {
    const result = evaluateQuestionnaire(REFLECTION_QUESTIONS, { [parent]: answer }, { includeOptional: true })
    expect(result.byKey[detail]).toEqual({ visible: true, answered: false, required: true, missing: true })
    expect(result.expectedCount).toBe(91)
    const cleared = evaluateQuestionnaire(REFLECTION_QUESTIONS, { [parent]: { option: '', multiple: [] } }, { includeOptional: true })
    expect(cleared.byKey[detail].visible).toBe(false)
    expect(cleared.expectedCount).toBe(90)
  })

  it('does not let retained descendant answers bypass a hidden ancestor', () => {
    const nested = [...questions, { ...questions[2], key: 'detail_followup', dependsOn: 'measure_detail' }]
    const result = evaluateQuestionnaire(nested, {
      uses_measure: { option: 'Nein' }, measure_detail: { text: 'Previously answered' },
    })
    expect(result.byKey.detail_followup.visible).toBe(false)
  })
})

describe('question grouping', () => {
  it('keeps dependent questions in the same group as their parent', () => {
    const grouped = groupQuestionsByIndicator([
      questions[0],
      { ...questions[1], group: 'Next Group' },
      {
        key: 'next_group_question',
        label: 'Question in next group',
        type: 'long text',
        group: 'Next Group',
        indicator: 'indicator',
        order: 3,
      },
    ])

    const groups = grouped.get('indicator')
    expect(Array.from(groups?.keys() ?? [])).toEqual(['Group', 'Next Group'])
    expect(groups?.get('Group')?.map((question) => question.key)).toEqual([
      'uses_measure',
      'measure_detail',
    ])
    expect(groups?.get('Next Group')?.map((question) => question.key)).toEqual([
      'next_group_question',
    ])
  })
})
