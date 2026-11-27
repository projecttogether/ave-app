"use server"

import { db } from "@/lib/db"
import { authenticators } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { IMPERSONATION_BLOCKED, isImpersonating } from "@/lib/auth/impersonation"
import { z } from "zod"

const passkeyNameSchema = z.string().trim().min(1, "Name darf nicht leer sein").max(100)

export async function getUserPasskeys() {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const userAuthenticators = await db.query.authenticators.findMany({
    where: eq(authenticators.userId, session.user.id),
  })

  // We only send safe data to the client. The schema has no createdAt
  // column, so none is reported (a fabricated "now" was misleading).
  return userAuthenticators.map(a => ({
    credentialID: a.credentialID,
    name: a.name || a.credentialDeviceType || "Unbekanntes Gerät",
  }))
}

export async function renamePasskey(credentialID: string, newName: string) {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  if (isImpersonating(session)) throw new Error(IMPERSONATION_BLOCKED)
  const name = passkeyNameSchema.parse(newName)

  await db.update(authenticators)
    .set({ name })
    .where(
      and(
        eq(authenticators.userId, session.user.id),
        eq(authenticators.credentialID, credentialID)
      )
    )

  revalidatePath('/settings')
}

export async function deletePasskey(credentialID: string) {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  if (isImpersonating(session)) throw new Error(IMPERSONATION_BLOCKED)

  await db.delete(authenticators).where(
    and(
      eq(authenticators.userId, session.user.id),
      eq(authenticators.credentialID, credentialID)
    )
  )

  revalidatePath('/settings')
}
