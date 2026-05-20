import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { r2CleanupJobs } from '../db/schema';

export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  // We don't advance a cursor between iterations: each delete removes the just-listed
  // keys from the bucket, so re-listing from the start of the prefix naturally returns
  // the next batch. Carrying a cursor across deletes would skip over keys that shifted
  // into the previous page's index range.
  for (;;) {
    const list = await bucket.list({ prefix, limit: 1000 });
    if (list.objects.length === 0) break;
    await bucket.delete(list.objects.map((o) => o.key));
    if (!list.truncated) break;
  }
}

export async function runR2Cleanup(
  db: Db,
  bucket: R2Bucket,
  jobId: string,
  courseId: string,
): Promise<void> {
  await db
    .update(r2CleanupJobs)
    .set({
      status: 'running',
      attempts: sql`${r2CleanupJobs.attempts} + 1`,
    })
    .where(eq(r2CleanupJobs.id, jobId));
  try {
    await deleteR2Prefix(bucket, `courses/${courseId}/`);
    await db
      .update(r2CleanupJobs)
      .set({ status: 'done', completedAt: new Date().toISOString(), lastError: null })
      .where(eq(r2CleanupJobs.id, jobId));
  } catch (err) {
    console.error('r2Cleanup failed', { jobId, courseId, err: String(err) });
    await db
      .update(r2CleanupJobs)
      .set({ status: 'failed', lastError: String(err) })
      .where(eq(r2CleanupJobs.id, jobId));
    throw err;
  }
}
