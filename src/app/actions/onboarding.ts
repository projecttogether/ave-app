'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Check whether the current user has completed onboarding.
 * Returns the timestamp if completed, null otherwise.
 */
export async function getOnboardingStatus(): Promise<Date | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const result = await db
    .select({ onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  return result[0]?.onboardingCompletedAt ?? null
}

/**
 * Mark the current user's onboarding as complete.
 * Called when all steps are done or user dismisses the wizard.
 */
export async function completeOnboarding(): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(users.id, session.user.id))
}
