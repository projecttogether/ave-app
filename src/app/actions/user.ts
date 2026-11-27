"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { nameSchema } from "@/lib/validation"

export async function updateName(name: string) {
    const session = await auth()

    if (!session?.user?.id) {
        throw new Error("Nicht autorisiert")
    }

    const validName = nameSchema.parse(name)

    await db.update(users)
        .set({ name: validName })
        .where(eq(users.id, session.user.id))

    revalidatePath("/settings")
    revalidatePath("/dashboard")
    return { success: true }
}
