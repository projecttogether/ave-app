'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Lock, Unlock } from 'lucide-react'
import { getFrozenYears, freezeYear, unfreezeYear } from '@/app/actions/data-freeze'

interface FrozenYear {
  id: string
  year: number
  frozenAt: Date | null
  frozenByEmail: string | null
}

const currentYear = new Date().getFullYear()
// Show the current year, 1 before, and 1 after
const DISPLAY_YEARS = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2]

export function DataFreezeManager() {
  const [frozenYears, setFrozenYears] = useState<FrozenYear[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [pendingYear, setPendingYear] = useState<number | null>(null)

  async function loadData() {
    try {
      const data = await getFrozenYears()
      setFrozenYears(data)
    } catch (err) {
      console.error('Failed to load frozen years:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function handleToggle(year: number, currentlyFrozen: boolean) {
    setPendingYear(year)
    startTransition(async () => {
      try {
        if (currentlyFrozen) {
          await unfreezeYear(year)
        } else {
          await freezeYear(year)
        }
        await loadData()
      } catch (err) {
        console.error('Failed to toggle freeze:', err)
      } finally {
        setPendingYear(null)
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const frozenYearNumbers = new Set(frozenYears.map((f) => f.year))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Berichtsjahre verwalten</CardTitle>
        <CardDescription>
          Gesperrte Jahre können von Benutzer:innen und Manager:innen nicht mehr bearbeitet werden.
          Nur Admins können die Sperre setzen oder aufheben.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jahr</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gesperrt am</TableHead>
              <TableHead>Gesperrt von</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DISPLAY_YEARS.map((year) => {
              const isFrozen = frozenYearNumbers.has(year)
              const freezeInfo = frozenYears.find((f) => f.year === year)
              const isThisYearPending = pendingYear === year && isPending

              return (
                <TableRow key={year}>
                  <TableCell className="font-medium text-base">{year}</TableCell>
                  <TableCell>
                    {isFrozen ? (
                      <Badge variant="destructive" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Gesperrt
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Unlock className="h-3 w-3" />
                        Offen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {freezeInfo?.frozenAt
                      ? new Date(freezeInfo.frozenAt).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {freezeInfo?.frozenByEmail || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isThisYearPending && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      <Switch
                        checked={isFrozen}
                        onCheckedChange={() => handleToggle(year, isFrozen)}
                        disabled={isPending}
                        aria-label={`Jahr ${year} ${isFrozen ? 'entsperren' : 'sperren'}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
