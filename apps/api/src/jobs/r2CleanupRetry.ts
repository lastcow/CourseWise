import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { r2CleanupJobs } from '../db/schema';
import { runR2Cleanup } from './r2Cleanup';

// Cap retries so a terminally-broken job (bucket gone, perms wrong) doesn't
// loop forever. After this many attempts, the row stays at status='failed'
// for a human to investigate.
const DEFAULT_MAX_ATTEMPTS = 3;

export interface R2CleanupRetrySummary {
  retried: number;
  succeeded: number;
  stillFailing: number;
}

/**
 * Picks up `r2_cleanup_jobs` rows that failed earlier (most often during the
 * `ctx.waitUntil(...)` after course-hard-delete) and replays them through
 * `runR2Cleanup`. Driven by the nightly retention cron so the spacing
 * between retries is naturally ~24h — no per-row exponential-backoff math
 * needed.
 */
export async function retryFailedR2CleanupJobs(
  db: Db,
  bucket: R2Bucket,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<R2CleanupRetrySummary> {
  // Only failed rows below the attempt cap. `running` rows are skipped —
  // they belong to another invocation. `done` rows are skipped trivially.
  const candidates = await db
    .select()
    .from(r2CleanupJobs)
    .where(and(eq(r2CleanupJobs.status, 'failed'), lt(r2CleanupJobs.attempts, maxAttempts)));

  let succeeded = 0;
  let stillFailing = 0;
  for (const job of candidates) {
    try {
      // runR2Cleanup transitions status to 'running' then 'done'/'failed' on
      // its own and bumps the attempts counter, so we don't have to.
      await runR2Cleanup(db, bucket, job.id, job.courseId);
      succeeded += 1;
    } catch {
      stillFailing += 1;
    }
  }

  return {
    retried: candidates.length,
    succeeded,
    stillFailing,
  };
}
