import { expect, it } from 'vitest'
import { parseOperatingCsv, serializeOperatingV2 } from '@/lib/operating-data/csv'
import { checkedOperatingPatch } from '@/lib/operating-data/publication'

const id = '00000000-0000-4000-8000-000000000001'
const csv = (value: string, field = 'total_food_spend') => `sub_organization_id,reporting_year,reporting_month,${field}\n${id},2025,1,${value}`

it.each(['Infinity', '-1', 'NaN', '1e3', '1,5', '1000000000000.000001', '0.0000001'])('rejects unsupported or inexact CSV amount %s', value => {
  expect(() => parseOperatingCsv(csv(value))).toThrow()
})
it('preserves decimal strings and measured zero without inventing blank values', () => {
  const rows = parseOperatingCsv(`sub_organization_id,reporting_year,reporting_month,coffee_spend,fair_trade_coffee_spend,total_food_spend\n${id},2025,1,100.000001,0,`)
  expect(rows[0].values).toEqual({ coffeeSpend: '100.000001', fairTradeCoffeeSpend: '0' })
  expect(parseOperatingCsv(csv('__CLEAR__'))[0].values).toEqual({ totalFoodSpend: null })
})
it('validates imported partial edits against the complete stored row', () => {
  const [row] = parseOperatingCsv(csv('70', 'coffee_spend'))
  expect(() => checkedOperatingPatch({ coffeeSpend: '100', fairTradeCoffeeSpend: '80' }, row.values)).toThrow('Fairtrade-Kaffee')
})
it('reads BOM, a semicolon directive and quoted multiline names with physical line numbers', () => {
  const [row] = parseOperatingCsv(`\uFEFFsep=;\nsub_organization_id;sub_organization_name;reporting_year;reporting_month;food_waste_amount\n${id};"Kitchen;\nNorth";2025;1;0`)
  expect(row).toMatchObject({ line: 4, name: 'Kitchen;\nNorth', values: { foodWasteAmount: '0' } })
})
it.each([
  'sub_organization_id,reporting_year,reporting_month,total_food_spend,total_food_spend',
  'sub_organization_id,reporting_year,reporting_month,total_food_spend,superseded_at',
  'sub_organization_id,reporting_year,reporting_month,total_food_spend,organic_scoring_result',
])('rejects duplicate or protected columns', headers => {
  expect(() => parseOperatingCsv(`${headers}\n${id},2025,1,100,5`)).toThrow()
})
it('rejects repeated periods even when one row supplies different indicators', () => {
  expect(() => parseOperatingCsv(csv('10') + `\n${id},2025,1,20`)).toThrow('Doppelte')
})
it('round-trips native quarterly precision and identity in the v2 export', () => {
  const output = serializeOperatingV2([{ subOrganizationId: id, reportingYear: 2025, reportingMonth: null, periodKind: 'quarter', periodIndex: 2,
    revision: 4, coverageConfirmed: true, subOrganization: { name: 'Kitchen, West' }, totalFoodSpend: '1000000000000', foodWasteAmount: '0.000001' }])
  expect(parseOperatingCsv(output)[0]).toMatchObject({ id, period: { kind: 'quarter', year: 2025, index: 2 }, revision: 4, coverageConfirmed: true, values: { totalFoodSpend: '1000000000000', foodWasteAmount: '0.000001' } })
})
it('requires closed calendar quarters, explicit coverage, and a valid v2 version', () => {
  const header = 'format_version,sub_organization_id,reporting_year,period_kind,period_index,coverage_confirmed,total_food_spend\n'
  for (const row of [`3,${id},2025,quarter,1,true,100`, `2,${id},2025,quarter,1,false,100`, `2,${id},2099,quarter,1,true,100`, `2,${id},2025,quarter,5,true,100`]) expect(() => parseOperatingCsv(header + row)).toThrow()
})
