'use client'

import React from 'react'
import Link from 'next/link'
import { useOnboardingOptional } from '@/hooks/use-onboarding'
import { Check, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react'

export function OnboardingWizard() {
  const onboarding = useOnboardingOptional()

  if (!onboarding || !onboarding.isVisible) return null

  const { steps, completedCount, isCompleted, isExpanded, toggleExpanded, dismiss } =
    onboarding

  // Celebration state when all done
  if (isCompleted) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="font-semibold">Geschafft!</span>
              </div>
              <button
                onClick={dismiss}
                className="rounded-md p-1 hover:bg-white/20 transition-colors"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Sie haben alle Schritte abgeschlossen. Viel Erfolg mit Ihren
              Nachhaltigkeitsdaten!
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={toggleExpanded}
          className="w-full bg-gradient-to-r from-primary to-primary/80 p-4 text-primary-foreground flex items-center justify-between hover:from-primary/95 hover:to-primary/75 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold text-sm">Erste Schritte</div>
              <div className="text-xs opacity-80">
                {completedCount} von {steps.length} erledigt
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress ring */}
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${(completedCount / steps.length) * 88} 88`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* Expandable content */}
        {isExpanded && (
          <div className="p-3">
            <ul className="space-y-1">
              {steps.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={`flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                      step.completed
                        ? 'opacity-60'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {/* Check circle */}
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        step.completed
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {step.completed && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-medium ${
                          step.completed
                            ? 'line-through text-muted-foreground'
                            : ''
                        }`}
                      >
                        {step.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {step.description}
                      </div>
                    </div>
                    {/* Step icon */}
                    <step.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>

            {/* Dismiss link */}
            <div className="mt-2 pt-2 border-t">
              <button
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
              >
                Ausblenden
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
