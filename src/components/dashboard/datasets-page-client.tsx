'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useContent } from '@/components/providers/content-provider'
import { useReportingFilters } from '@/components/reporting-filters-provider'
import { AllReportingYears } from '@/components/reporting-filter-bar'
import { EditableText } from '@/components/editable-text'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DatasetExportButton } from './dataset-export-button'
import { ReflectionDatasetsTab } from './reflection-datasets-tab'
import { getIndicatorDataSets, getScoringDataSets, type IndicatorDataSet, type ScoringDataSet } from '@/app/actions/datasets'
import { getAdminIndicatorDataSets, getAdminScoringDataSets } from '@/app/admin/actions/datasets'

type FilterOptions = {
  organizations: { id: string; name: string }[]
  subOrganizations: { id: string; name: string; organizationId: string }[]
  years: number[]
  canViewReflection: boolean
}

export function DatasetsPageClient({ filterOptions, title, subtitle, editableHeader = true,
  showOrganizationColumn = false, defaultTab = 'operating', admin = false,
}: {
  filterOptions: FilterOptions
  title?: string
  subtitle?: string
  editableHeader?: boolean
  showOrganizationColumn?: boolean
  defaultTab?: 'operating' | 'reflection'
  admin?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { filters } = useReportingFilters()
  const t = useContent()
  const requestedTab = searchParams.get('tab') ?? defaultTab
  const tab = requestedTab === 'scoring' ? 'scoring'
    : requestedTab === 'reflection' && filterOptions.canViewReflection ? 'reflection' : 'operating'
  const year = searchParams.get('allYears') === '1' ? undefined : filters.year
  const organizationId = filters.organizationId
  const subOrganizationId = filters.subOrgId
  const requestKey = JSON.stringify([tab, organizationId, subOrganizationId, year, admin])
  const [result, setResult] = useState<{ key: string; rows: (IndicatorDataSet | ScoringDataSet)[]; error?: boolean }>()

  useEffect(() => {
    if (tab === 'reflection') return
    let cancelled = false
    const load = tab === 'operating'
      ? admin ? getAdminIndicatorDataSets : getIndicatorDataSets
      : admin ? getAdminScoringDataSets : getScoringDataSets
    load({ organizationId, subOrganizationId, year }).then(rows => {
      if (!cancelled) setResult({ key: requestKey, rows })
    }).catch(error => {
      console.error('Failed to load datasets:', error)
      if (!cancelled) setResult({ key: requestKey, rows: [], error: true })
    })
    return () => { cancelled = true }
  }, [tab, organizationId, subOrganizationId, year, admin, requestKey])

  const loading = result?.key !== requestKey
  const rows = loading ? [] : result.rows
  const columns = showOrganizationColumn ? 5 : 4
  const exportFilters = { organizationId, subOrganizationId, year }
  const pageTitle = title || t('page.datasets.title') || 'Datensätze'
  const pageSubtitle = subtitle || t('page.datasets.subtitle') || 'Betriebsdaten, Scoring-Antworten und Reflexionsdaten ansehen und exportieren.'

  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold tracking-tight">{pageTitle}</h2>
      <p className="text-muted-foreground">{editableHeader
        ? <EditableText contentKey="page.datasets.subtitle" initialValue={pageSubtitle}>{pageSubtitle}</EditableText>
        : pageSubtitle}</p>
    </div>
    <Tabs value={tab} onValueChange={value => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', value)
      router.push(`${pathname}?${params}`, { scroll: false })
    }} className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="operating">Betriebsdaten</TabsTrigger>
        <TabsTrigger value="scoring">Scoring-Fragen</TabsTrigger>
        {filterOptions.canViewReflection && <TabsTrigger value="reflection">Reflexionsfragen</TabsTrigger>}
      </TabsList>
      {(['operating', 'scoring'] as const).map(type => <TabsContent key={type} value={type} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AllReportingYears />
          {!admin && <span className="flex flex-wrap gap-2">
            {type === 'operating' && <DatasetExportButton type="operating-import" filters={exportFilters} />}
            <DatasetExportButton type={type} filters={exportFilters} />
          </span>}
        </div>
        <Card><CardContent className="p-0"><Table>
          <TableHeader><TableRow>
            {showOrganizationColumn && <TableHead>Organisation</TableHead>}
            <TableHead>Unterorganisation</TableHead><TableHead>Jahr</TableHead>
            <TableHead className="text-center">Vollständigkeit</TableHead><TableHead>Letzte Aktualisierung</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading || result?.error || rows.length === 0 ? <TableRow><TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
              {loading ? 'Laden…' : result?.error ? 'Die Datensätze konnten nicht geladen werden.' : 'Keine Datensätze für diese Auswahl. Ändern Sie die Filter oder zeigen Sie alle Jahre an.'}
            </TableCell></TableRow> : rows.map(row => <TableRow key={`${row.subOrganizationId}-${row.year}`} className="cursor-pointer"
              onClick={() => router.push(`${admin ? '/admin' : ''}/datasets/${type}/${row.subOrganizationId}/${row.year}?${searchParams}`)}>
              {showOrganizationColumn && <TableCell>{row.organizationName}</TableCell>}
              <TableCell>{row.subOrganizationName}</TableCell><TableCell>{row.year}</TableCell>
              <TableCell className="text-center"><Badge variant={row.completeness < 40 ? 'destructive' : 'default'}
                className={row.completeness >= 80 ? 'bg-emerald-600' : row.completeness >= 40 ? 'bg-amber-500' : undefined}>{row.completeness}%</Badge></TableCell>
              <TableCell>{row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString('de-DE') : '–'}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table></CardContent></Card>
      </TabsContent>)}
      {filterOptions.canViewReflection && <TabsContent value="reflection"><ReflectionDatasetsTab admin={admin} /></TabsContent>}
    </Tabs>
  </div>
}
