import { getUserSubOrganizations } from '@/app/actions/sub-organizations'
import { CSV_V2_HEADERS } from '@/lib/operating-data/csv'
import { csvEscape } from '@/lib/csv'
import { reportingToday } from '@/lib/operating-data/periods'

export async function GET() {
  try {
    const kitchens = await getUserSubOrganizations()
    const rows = kitchens.map(kitchen => CSV_V2_HEADERS.map(header => csvEscape(({
      format_version: '2', sub_organization_id: kitchen.id, sub_organization_name: kitchen.name,
      reporting_year: String(reportingToday().year), period_kind: 'year', period_index: '1', coverage_confirmed: 'false',
    } as Record<string, string>)[header] ?? '')).join(','))
    return new Response('\uFEFF' + [CSV_V2_HEADERS.join(','), ...rows].join('\n'), { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="operating-import-v2.csv"',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch { return new Response('Unauthorized', { status: 401 }) }
}
