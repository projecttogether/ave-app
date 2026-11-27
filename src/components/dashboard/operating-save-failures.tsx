'use client'

import { Button } from '@/components/ui/button'
import type { OperatingEditorState } from '@/lib/operating-data/editor'

export function OperatingSaveFailures({ failures, subOrganizations, retry }: {
  failures: OperatingEditorState['failures']
  subOrganizations: { id: string; name: string }[]
  retry: (key: string) => Promise<void>
}) {
  if (!failures.length) return null
  return <div role="alert" className="space-y-2 rounded-md border border-destructive p-3">
    {failures.map(failure => <div key={failure.key} className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">
        {subOrganizations.find(sub => sub.id === failure.period.subOrganizationId)?.name || 'Betrieb'}
        {' · '}{failure.period.month ? `${failure.period.month}/` : ''}{failure.period.year}
        {': '}{failure.error} Deine Änderungen bleiben zum erneuten Speichern erhalten.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void retry(failure.key)}>Erneut versuchen</Button>
    </div>)}
  </div>
}
