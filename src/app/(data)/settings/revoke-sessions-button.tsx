'use client'

import { useState } from 'react'
import { revokeAllMySessions } from '@/app/actions/session'

export function RevokeSessionsButton() {
  const [confirming, setConfirming] = useState(false)

  async function handleRevoke() {
    await revokeAllMySessions()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sind Sie sicher?</span>
        <button
          onClick={handleRevoke}
          className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
        >
          Ja, alle abmelden
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
        >
          Abbrechen
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
    >
      Alle Geraete abmelden
    </button>
  )
}
