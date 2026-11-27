'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReportingFilters } from '@/components/reporting-filters-provider'
import { getReflectionDataSets, type ReflectionDataSet } from '@/app/actions/reflection'
import { getAdminReflectionDataSets } from '@/app/admin/actions/datasets'
import { DatasetExportButton } from '@/components/dashboard/dataset-export-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function ReflectionDatasetsTab({ admin = false }: { admin?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const { filters } = useReportingFilters()
  const organizationFilter = filters.organizationId || 'all'
  const [datasets, setDatasets] = useState<ReflectionDataSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const load = admin
      ? getAdminReflectionDataSets(organizationFilter === 'all' ? undefined : organizationFilter)
      : getReflectionDataSets(organizationFilter === 'all' ? undefined : { organizationId: organizationFilter })
    load
      .then(data => {
        if (!cancelled) setDatasets(data)
      })
      .catch(error => {
        console.error('Failed to load reflection datasets:', error)
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [organizationFilter, admin])

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Reflexionsfragen werden für die gesamte Organisation und unabhängig vom Berichtsjahr erfasst.
      </p>

      {!admin && <DatasetExportButton type="reflection" filters={{ organizationId: organizationFilter === 'all' ? undefined : organizationFilter }} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead className="text-center">Antworten</TableHead>
                <TableHead className="text-center">Vollständigkeit</TableHead>
                <TableHead>Letzte Aktualisierung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || error || datasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {loading ? 'Laden…' : error ? 'Die Datensätze konnten nicht geladen werden.' : 'Keine Datensätze gefunden.'}
                  </TableCell>
                </TableRow>
              ) : datasets.map(dataset => (
                <TableRow
                  key={dataset.organizationId}
                  className="cursor-pointer"
                  onClick={() => router.push(`${admin ? '/admin' : ''}/datasets/reflection/${dataset.organizationId}?${params}`)}
                >
                  <TableCell>
                    <Link href={`${admin ? '/admin' : ''}/datasets/reflection/${dataset.organizationId}?${params}`} onClick={event => event.stopPropagation()}>
                      {dataset.organizationName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">{dataset.responseCount}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={dataset.completeness < 40 ? 'destructive' : 'default'}
                      className={dataset.completeness >= 80 ? 'bg-emerald-600' : dataset.completeness >= 40 ? 'bg-amber-500' : undefined}
                    >
                      {dataset.completeness}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {dataset.lastUpdated
                      ? new Date(dataset.lastUpdated).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
