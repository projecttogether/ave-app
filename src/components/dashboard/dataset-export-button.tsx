'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { exportDataSetsCsv, type DatasetExportType, type DatasetExportFilters } from '@/app/actions/dataset-export'
import { downloadCsv } from '@/lib/download-csv'

export function DatasetExportButton({ type, filters = {} }: { type: DatasetExportType; filters?: DatasetExportFilters }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const csv = await exportDataSetsCsv(type, filters)
      const name = { operating: 'betriebsdaten', 'operating-import': 'betriebsdaten-import-v2', scoring: 'scoring', reflection: 'reflexion' }[type]
      downloadCsv(csv, `ave_${name}_${filters.year ?? new Date().toISOString().slice(0, 10)}.csv`)
    } catch {
      setError('Export fehlgeschlagen. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleExport} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {loading ? 'Exportieren...' : type === 'operating-import' ? 'CSV für Wiederimport' : 'Daten exportieren (CSV)'}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
