'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ReportingLink } from '@/components/reporting-filters-provider'

export function DatasetBackLink({ href, ...props }: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const current = useSearchParams()
  const url = new URL(href, 'https://ave.invalid')
  if (url.pathname === '/datasets' || url.pathname === '/admin/datasets') {
    for (const key of ['year', 'granularity', 'organizationId', 'subOrgId', 'tab', 'allYears']) {
      const value = current.get(key)
      if (value !== null && !url.searchParams.has(key)) url.searchParams.set(key, value)
    }
  }
  return <ReportingLink href={`${url.pathname}${url.search}${url.hash}`} {...props} />
}
