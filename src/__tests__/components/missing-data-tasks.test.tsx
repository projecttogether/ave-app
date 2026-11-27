// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MissingDataTasks } from '@/components/dashboard/missing-data-tasks'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

const entry = (subOrganizationId: string, subOrganizationName: string) => ({
  subOrganizationId, subOrganizationName, operatingTasks: [{ period: { kind: 'month' as const, year: 2026, index: 2 }, state: 'due' as const, reason: 'missing_data' as const }], needsFrequency: false, canWriteOperating: true,
  missingScoring: 1, firstMissingScoringKey: 'reg_score_regional_share_total',
})

describe('missing data tasks', () => {
  it('links only tasks whose site the entry forms can open', async () => {
    await act(async () => root.render(<MissingDataTasks formSubOrgIds={['own']}
      tasksData={[{ year: 2026, data: [entry('own', 'Eigene Küche'), entry('foreign', 'Fremde Küche')] }]} />))
    const links = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(links).toEqual([
      '/form/operating?year=2026&subOrgId=own&entryMode=monthly&month=2',
      '/form/scoring?year=2026&subOrgId=own#scoring-reg_score_regional_share_total-container',
    ])
    expect(container.textContent).toContain('Fremde Küche')
    expect(container.textContent).toContain('Eingabe durch die zugeordnete Organisation')
  })

  it('keeps every task linked when no form scope is given', async () => {
    await act(async () => root.render(<MissingDataTasks tasksData={[{ year: 2026, data: [entry('a', 'A'), entry('b', 'B')] }]} />))
    expect(container.querySelectorAll('a')).toHaveLength(4)
  })
})

it('shows the yearly task in progress alongside an exact due quarter and a setup choice', async () => {
  await act(async () => root.render(<MissingDataTasks currentYear={2026} tasksData={[{ year: 2026, data: [
    { ...entry('annual', 'Annual'), missingScoring: 0, operatingTasks: [{ period: { kind: 'year', year: 2026, index: 1 }, state: 'in_progress', reason: 'annual_review' }] },
    { ...entry('quarter', 'Quarter'), missingScoring: 0, operatingTasks: [{ period: { kind: 'quarter', year: 2026, index: 2 }, state: 'due', reason: 'missing_data' }] },
    { ...entry('empty', 'Empty'), missingScoring: 0, needsFrequency: true, operatingTasks: [] },
  ] }]} />))
  expect(container.textContent).toContain('Jahr läuft')
  expect(container.textContent).toContain('Erfassungsrhythmus für 2026 wählen')
  expect([...container.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual([
    '/operating-periods?year=2026&subOrgId=quarter&quarter=2&workflow=quarter',
    '/form/operating?year=2026&subOrgId=empty',
    '/form/operating?year=2026&subOrgId=annual&entryMode=yearly',
  ])
})
