'use client'

import { DatasetsPageClient } from '@/components/dashboard/datasets-page-client'

export function AdminDatasetsPageClient({ filterOptions }: {
  filterOptions: {
    organizations: { id: string; name: string }[]
    subOrganizations: { id: string; name: string; organizationId: string }[]
    years: number[]
  }
}) {
  return <DatasetsPageClient admin filterOptions={{ ...filterOptions, canViewReflection: true }}
    title="Admin-Datensätze" subtitle="Organisationsübergreifende Übersicht der Betriebsdaten, Scoring-Antworten und Reflexionsdaten."
    editableHeader={false} showOrganizationColumn />
}
