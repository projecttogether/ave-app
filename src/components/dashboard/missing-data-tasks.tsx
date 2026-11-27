"use client"

import type { MissingDataEntry } from "@/app/actions/missing-data"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2 } from "lucide-react"
import { columns, MissingTask } from "./tasks/columns"
import { DataTable } from "./tasks/data-table"
import { operatingEntryHref } from "@/lib/operating-data/entry-selection"
import { periodKey, periodLabel, reportingToday } from "@/lib/operating-data/periods"

/** Tasks for sites outside the user's form scope (e.g. an admin viewing another organization) are listed without a link. */
export function MissingDataTasks({ tasksData, formSubOrgIds, currentYear = reportingToday().year }: {
  tasksData: { data: MissingDataEntry[], year: number }[]
  formSubOrgIds?: string[]
  currentYear?: number
}) {
  if (!tasksData || tasksData.length === 0) {
    return null
  }

  const tasks: MissingTask[] = []

  tasksData.forEach(({ year, data }) => {
    if (!data || data.length === 0) return;
    
    const opScoringPriority = year < currentYear ? "high" : "medium";

    data.forEach((entry) => {
      const canOpen = !formSubOrgIds || formSubOrgIds.includes(entry.subOrganizationId)
      const unavailableReason = !canOpen ? 'Eingabe durch die zugeordnete Organisation'
        : !entry.canWriteOperating ? 'Nur Ansicht' : undefined
      if (entry.needsFrequency) tasks.push({
        id: `frequency-${entry.subOrganizationId}-${year}`, year,
        title: `Erfassungsrhythmus für ${year} wählen`, organization: entry.subOrganizationName,
        type: 'operations', priority: opScoringPriority, status: 'choice', unavailableReason,
        href: unavailableReason ? undefined : `/form/operating?year=${year}&subOrgId=${entry.subOrganizationId}`,
      })
      for (const task of entry.operatingTasks) {
        tasks.push({
          id: `operating-${entry.subOrganizationId}-${periodKey(task.period)}`, year,
          title: task.reason === 'annual_review' && task.state === 'due' ? `Jahresdaten für ${year} prüfen und bestätigen`
            : `Betriebsdaten für ${periodLabel(task.period)} erfassen`,
          organization: entry.subOrganizationName, type: 'operations', status: task.state,
          priority: task.state === 'in_progress' ? 'low' : opScoringPriority,
          unavailableReason, href: unavailableReason ? undefined : operatingEntryHref(entry.subOrganizationId, task.period),
        })
      }

      if (entry.missingScoring > 0) {
        const hash = entry.firstMissingScoringKey ? `#scoring-${entry.firstMissingScoringKey}-container` : "";
        tasks.push({
          id: `scoring-${entry.subOrganizationId}-${year}`,
          year,
          title: `${entry.missingScoring} offene Fragen beantworten`,
          organization: entry.subOrganizationName,
          type: "scoring",
          status: "due",
          priority: opScoringPriority,
          href: canOpen ? `/form/scoring?year=${year}&subOrgId=${entry.subOrganizationId}${hash}` : undefined,
        })
      }
      
    })
  })

  tasks.sort((a, b) => Number(a.status === 'in_progress') - Number(b.status === 'in_progress'))

  if (tasks.length === 0) {
    return (
      <Card className="col-span-1 md:col-span-2 mt-6 border-dashed bg-muted/50">
        <CardHeader className="text-center flex flex-col items-center justify-center py-10">
          <div className="bg-primary/10 p-3 rounded-full mb-4">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-muted-foreground">Keine offenen Aufgaben für diese Auswahl.</CardTitle>
          <CardDescription className="mt-2">
            Andere Berichtsjahre oder Unterorganisationen können weiterhin offene Aufgaben enthalten.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="col-span-1 md:col-span-2 mt-6 space-y-4">
      <DataTable columns={columns} data={tasks} />
    </div>
  )
}
