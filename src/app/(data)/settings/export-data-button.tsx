'use client'

import { useState } from 'react'
import { exportUserData } from '@/app/actions/data-export'

export function ExportDataButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const result = await exportUserData()
      const json = JSON.stringify(result.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ave-meine-daten-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Download fehlgeschlagen. Ihr Browser oder Ihre Unternehmensrichtlinien blockieren möglicherweise Downloads.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
      >
        {loading ? 'Exportieren...' : 'Meine Daten herunterladen'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
