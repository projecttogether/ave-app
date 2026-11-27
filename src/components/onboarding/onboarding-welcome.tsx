'use client'

import Link from 'next/link'
import { ClipboardEdit, ArrowRight, Sparkles } from 'lucide-react'

import { useContent } from '@/components/providers/content-provider'
import { EditableText } from '@/components/editable-text'

/**
 * Welcome card shown on the dashboard when the user has no data yet.
 * Replaces empty charts with an actionable onboarding CTA.
 */
export function OnboardingWelcome() {
  const content = useContent()

  return (
    <div className="col-span-full">
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Gradient banner */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 md:p-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {content('welcome.title')}
              </h2>
            </div>

            <p className="text-muted-foreground mb-6 text-base leading-relaxed">
              <EditableText contentKey="welcome.subtitle" initialValue={content('welcome.subtitle')} isTextarea>
                {content('welcome.subtitle')}
              </EditableText>
            </p>

            {/* Steps preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
              <StepPreview number={1} label="Daten eingeben" active />
              <StepPreview number={2} label="Indikatoren ansehen" />
              <StepPreview number={3} label="Vergleichen" />
            </div>

            <Link
              href="/form/operating"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <ClipboardEdit className="h-4 w-4" />
              Betriebsdaten eingeben
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepPreview({
  number,
  label,
  active = false,
}: {
  number: number
  label: string
  active?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        active
          ? 'border-primary/30 bg-primary/5'
          : 'border-transparent bg-muted/50'
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {number}
      </div>
      <span
        className={`text-sm font-medium ${
          active ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </div>
  )
}
