import {
  ClipboardEdit,
  LayoutDashboard,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

export interface OnboardingStep {
  /** Unique stable identifier */
  id: string
  /** German label shown in checklist */
  title: string
  /** Short description of what the user should do */
  description: string
  /** Target route — the wizard links here */
  href: string
  /** Icon shown in the checklist */
  icon: LucideIcon
}

/**
 * Onboarding steps — the single source of truth.
 *
 * These are ordered goal-based milestones (not DOM targets),
 * so they stay resilient to UI changes. If a route changes,
 * update the `href` here and everything else adapts.
 */
export const onboardingSteps: OnboardingStep[] = [
  {
    id: "enter-data",
    title: "Betriebsdaten eingeben",
    description: "Geben Sie Ihre ersten Betriebsdaten ein, um loszulegen.",
    href: "/form/operating",
    icon: ClipboardEdit,
  },
  {
    id: "view-dashboard",
    title: "Übersicht ansehen",
    description: "Sehen Sie Ihre Nachhaltigkeitsindikatoren auf einen Blick.",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "compare",
    title: "Vergleich nutzen",
    description: "Vergleichen Sie Ihre Daten mit Benchmarks anderer.",
    href: "/vergleich",
    icon: BarChart3,
  },
]

/** localStorage key for persisting step progress */
export const ONBOARDING_STORAGE_KEY = "ave-onboarding-progress"

/** localStorage key for dismissed state */
export const ONBOARDING_DISMISSED_KEY = "ave-onboarding-dismissed"
