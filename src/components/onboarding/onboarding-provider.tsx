'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useTransition,
} from 'react'
import { usePathname } from 'next/navigation'
import {
  onboardingSteps,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_DISMISSED_KEY,
  type OnboardingStep,
} from '@/lib/onboarding/config'
import { completeOnboarding } from '@/app/actions/onboarding'

export interface StepWithStatus extends OnboardingStep {
  completed: boolean
}

interface OnboardingContextValue {
  /** Steps with their current completion status */
  steps: StepWithStatus[]
  /** The earliest incomplete step, or null if all done */
  currentStep: StepWithStatus | null
  /** Number of completed steps */
  completedCount: number
  /** Whether all steps are done */
  isCompleted: boolean
  /** Whether the wizard should be visible */
  isVisible: boolean
  /** Whether the wizard is expanded (vs. minimized) */
  isExpanded: boolean
  /** Toggle expanded/collapsed */
  toggleExpanded: () => void
  /** Mark a step as complete */
  completeStep: (stepId: string) => void
  /** Permanently dismiss the wizard */
  dismiss: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error('useOnboarding must be used within <OnboardingProvider>')
  }
  return ctx
}

/**
 * Safe hook that returns null if not inside the provider.
 * Useful in components that may or may not have the provider.
 */
export function useOnboardingOptional() {
  return useContext(OnboardingContext)
}

interface OnboardingProviderProps {
  children: React.ReactNode
  /** Server-side check: has the user already completed onboarding? */
  onboardingCompleted: boolean
}

export function OnboardingProvider({
  children,
  onboardingCompleted,
}: OnboardingProviderProps) {
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  // If server says already completed, never show
  const [dismissed, setDismissed] = useState(onboardingCompleted)
  const [isExpanded, setIsExpanded] = useState(true)
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(
    new Set()
  )
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (onboardingCompleted) {
      setHydrated(true)
      return
    }
    try {
      const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (stored) {
        const ids = JSON.parse(stored) as string[]
        setCompletedStepIds(new Set(ids))
      }
      const wasDismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY)
      if (wasDismissed === 'true') {
        setDismissed(true)
      }
    } catch {
      // Ignore storage errors
    }
    setHydrated(true)
  }, [onboardingCompleted])

  // Persist to localStorage whenever completedStepIds changes
  useEffect(() => {
    if (!hydrated || onboardingCompleted) return
    try {
      localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify([...completedStepIds])
      )
    } catch {
      // Ignore
    }
  }, [completedStepIds, hydrated, onboardingCompleted])

  // Auto-complete steps based on route visits
  useEffect(() => {
    if (!hydrated || dismissed) return

    // "enter-data": complete when user visits or leaves the operating form
    if (pathname.startsWith('/form/operating')) {
      if (!completedStepIds.has('enter-data')) {
        setCompletedStepIds((prev) => new Set([...prev, 'enter-data']))
      }
    }
    // "view-dashboard": complete when user visits the dashboard
    if (pathname === '/dashboard') {
      if (!completedStepIds.has('view-dashboard')) {
        setCompletedStepIds((prev) => new Set([...prev, 'view-dashboard']))
      }
    }
    // "compare": complete when user visits vergleich
    if (pathname === '/vergleich') {
      if (!completedStepIds.has('compare')) {
        setCompletedStepIds((prev) => new Set([...prev, 'compare']))
      }
    }
  }, [pathname, hydrated, dismissed, completedStepIds])

  const steps: StepWithStatus[] = onboardingSteps.map((step) => ({
    ...step,
    completed: completedStepIds.has(step.id),
  }))

  const completedCount = steps.filter((s) => s.completed).length
  const isCompleted = completedCount === steps.length
  const currentStep = steps.find((s) => !s.completed) ?? null

  // When all steps are complete, persist to server
  useEffect(() => {
    if (isCompleted && !onboardingCompleted && !dismissed) {
      startTransition(() => {
        completeOnboarding()
      })
    }
  }, [isCompleted, onboardingCompleted, dismissed, startTransition])

  const completeStep = useCallback((stepId: string) => {
    setCompletedStepIds((prev) => new Set([...prev, stepId]))
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    } catch {
      // Ignore
    }
    startTransition(() => {
      completeOnboarding()
    })
  }, [startTransition])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const isVisible = hydrated && !dismissed && !onboardingCompleted

  return (
    <OnboardingContext.Provider
      value={{
        steps,
        currentStep,
        completedCount,
        isCompleted,
        isVisible,
        isExpanded,
        toggleExpanded,
        completeStep,
        dismiss,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}
