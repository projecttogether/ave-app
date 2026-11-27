import { DataFreezeManager } from '@/components/admin/data-freeze-manager'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Admin - Datensperren',
}

export default function DataFreezePage() {
    return (
        <div className="space-y-6">
            <DataFreezeManager />
        </div>
    )
}
