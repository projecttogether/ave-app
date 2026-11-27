import { getAdminReflectionDataSetDetail } from '@/app/admin/actions/datasets'
import { ReflectionDatasetDetail } from '@/components/dashboard/reflection-dataset-detail'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin - Reflexionsdaten' }

export default async function AdminReflectionDataSetPage({ params }: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  const detail = await getAdminReflectionDataSetDetail(organizationId)
  return <ReflectionDatasetDetail {...detail} organizationId={organizationId} admin />
}
