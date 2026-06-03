import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { courseExportJobs } from '../db/schema';

export interface CourseExportSweepSummary {
  deleted: number;
  errors: number;
}

/**
 * Data-minimization: delete the R2 ZIP for completed course exports whose
 * `expires_at` has passed, then null the object key so the row isn't re-swept.
 * Driven by the nightly cron. The job row is kept (status stays 'done', but the
 * download endpoint already 410s once expired) for a lightweight audit trail.
 */
export async function sweepExpiredCourseExports(
  db: Db,
  bucket: R2Bucket,
  now: Date = new Date(),
): Promise<CourseExportSweepSummary> {
  const expired = await db
    .select({ id: courseExportJobs.id, objectKey: courseExportJobs.objectKey })
    .from(courseExportJobs)
    .where(
      and(
        eq(courseExportJobs.status, 'done'),
        isNotNull(courseExportJobs.objectKey),
        lt(courseExportJobs.expiresAt, now.toISOString()),
      ),
    )
    .limit(200);

  let deleted = 0;
  let errors = 0;
  for (const job of expired) {
    if (!job.objectKey) continue;
    try {
      await bucket.delete(job.objectKey);
      await db
        .update(courseExportJobs)
        .set({ objectKey: null, updatedAt: now.toISOString() })
        .where(eq(courseExportJobs.id, job.id));
      deleted++;
    } catch (err) {
      errors++;
      console.error('course.export.sweep.failed', { jobId: job.id, err });
    }
  }
  return { deleted, errors };
}
