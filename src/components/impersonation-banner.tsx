'use client'

import { stopImpersonating } from '@/app/actions/impersonate'
import { X } from 'lucide-react'

interface ImpersonationBannerProps {
    targetEmail: string
    realEmail: string
}

export function ImpersonationBanner({ targetEmail, realEmail }: ImpersonationBannerProps) {
    return (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950">
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 text-sm font-medium">
                <span>
                    Angemeldet als <strong>{targetEmail}</strong>
                    <span className="ml-1.5 opacity-75">(Echte Identität: {realEmail})</span>
                </span>
                <form action={stopImpersonating}>
                    <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                        <X className="h-3 w-3" />
                        Beenden
                    </button>
                </form>
            </div>
        </div>
    )
}
