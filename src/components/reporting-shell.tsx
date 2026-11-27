import { getReportingFilterOptions } from '@/lib/reporting-filter-options'
import { ReportingFiltersProvider } from './reporting-filters-provider'

export async function ReportingShell({ children }: { children: React.ReactNode }) {
  const { options, storageKey } = await getReportingFilterOptions()
  return <ReportingFiltersProvider key={storageKey} options={options} storageKey={storageKey}>{children}</ReportingFiltersProvider>
}
