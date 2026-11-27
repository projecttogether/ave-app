import { unstable_cache } from "next/cache";
import { publicDb as db } from "@/lib/db";
import { appContent } from "@/lib/db/schema";
import { defaultAppContent } from "./defaults";
import { errorSummary } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const getAppContent = unstable_cache(
  async () => {
    try {
      // Fetch all dynamic content stored in the database
      const dbContent = await db.select().from(appContent);

      // Start with our hardcoded defaults to guarantee completeness
      const mergedConfig = { ...defaultAppContent };

      // Override defaults with any database records that exist
      for (const row of dbContent) {
        mergedConfig[row.key] = row.value;
      }
      
      return mergedConfig;
    } catch (error) {
       // Reliability: If DB is unreachable, immediately fallback to defaults
       logger.error('Failed to fetch app content from database', errorSummary(error));
       return defaultAppContent;
    }
  },
  ['app-content-cache-indicator-methodology-v2'], // Cache Key
  { tags: ['app-content'] } // Tag for targeted invalidation
);
