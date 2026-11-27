"use server";

import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { appContent } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Editable texts use dotted keys such as "page.dashboard.subtitle". Other
// app_content rows, e.g. dashboard_links, have their own validated actions.
const contentUpdateSchema = z.object({
  key: z.string().max(200).regex(/^[a-z][a-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/),
  value: z.string().max(20000),
});

export async function updateAppContent(key: string, value: string) {
  try {
    // 1. Authorization
    const session = await auth();
    const roles = (session?.user as any)?.roles || [];

    if (!session?.user?.id || (!roles.includes("admin") && !roles.includes("super_admin"))) {
       return { error: "Unauthorized" };
    }
    const parsed = contentUpdateSchema.safeParse({ key, value });
    if (!parsed.success) return { error: "Invalid content" };
    ({ key, value } = parsed.data);

    // 2. Upsert into database
    const existing = await db.select().from(appContent).where(eq(appContent.key, key));
    if (existing.length > 0) {
      await db.update(appContent).set({ value, updatedBy: session.user.id, updatedAt: new Date() }).where(eq(appContent.key, key));
    } else {
      await db.insert(appContent).values({ key, value, updatedBy: session.user.id });
    }

    // 3. Invalidate purely the cached content across all instances globally
    // @ts-expect-error Next.js 16 types sometimes expect a second argument for experimental features, but this works at runtime.
    revalidateTag("app-content");

    auditLog({ action: 'data.update', userId: session.user.id, resource: `content:${key}`, resourceType: 'appContent', details: { length: value.length } });

    return { success: true };
  } catch (error) {
    logger.error('Failed to update app content', errorSummary(error));
    return { error: "Failed to update content" };
  }
}
