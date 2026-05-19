import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { fileAssets, gammaGenerationJobs, presentations } from '../../db/schema';
import { ApiException, ERROR_CODES } from '../../lib/errors';
import type { GammaClient, GammaGetGenerationResponse } from './client';

const MIN_POLL_GAP_MS = 4_000;

export interface PollDeps {
  db: Db;
  client: GammaClient;
  r2: R2Bucket | undefined;
  bucketName: string;
  now?: () => Date;
  fetchExport?: typeof fetch; // injectable for tests
}

/**
 * If the job is still `pending`, ask Gamma for its current state — but
 * throttled to at most one upstream call per `MIN_POLL_GAP_MS` per job so
 * multiple polling tabs don't multiply traffic to Gamma. When Gamma reports
 * `completed`, stream the `.pptx` into R2 (best-effort) and stamp the
 * presentation row with the external URL + file asset. Always returns the
 * up-to-date job row.
 *
 * Concurrency: the throttle window doubles as a lease. We atomically advance
 * `last_polled_at` *only* if the job is still pending and the throttle window
 * has elapsed; if 0 rows are returned, another caller already claimed this
 * tick — we bail and return the current row. The final `completed`/`failed`
 * write also re-asserts `status='pending'` so a slow finalize loop can't
 * overwrite a faster one.
 */
export async function pollAndFinalize(jobId: string, deps: PollDeps) {
  const { db, client, r2, bucketName, fetchExport = fetch } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const leaseCutoffIso = new Date(now.getTime() - MIN_POLL_GAP_MS).toISOString();

  // First, lookup the job (404 if missing, or short-circuit if already done).
  const [job] = await db
    .select()
    .from(gammaGenerationJobs)
    .where(eq(gammaGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Gamma job not found');
  if (job.status !== 'pending' || !job.gammaGenerationId) return job;

  // Fast path: if the row we just read is still well within the throttle
  // window, don't even bother trying to claim. Saves one update round-trip
  // per polling tab. Note: this is just a perf optimization; the atomic
  // claim below is what actually prevents the race.
  if (job.lastPolledAt) {
    const gap = now.getTime() - new Date(job.lastPolledAt).getTime();
    if (gap < MIN_POLL_GAP_MS) return job;
  }

  // Atomically claim this poll tick: bump last_polled_at only if the job is
  // still pending AND the throttle window has elapsed. Zero rows means a
  // concurrent caller is mid-finalize — bail and return the current row.
  const claimed = await db
    .update(gammaGenerationJobs)
    .set({ lastPolledAt: nowIso, updatedAt: nowIso })
    .where(
      and(
        eq(gammaGenerationJobs.id, jobId),
        eq(gammaGenerationJobs.status, 'pending'),
        or(
          isNull(gammaGenerationJobs.lastPolledAt),
          lt(gammaGenerationJobs.lastPolledAt, leaseCutoffIso),
        ),
      ),
    )
    .returning();
  if (claimed.length === 0) return job;

  // We already advanced last_polled_at above; any thrown upstream error will
  // simply mean the next poll retries.
  const resp: GammaGetGenerationResponse = await client.getGeneration(job.gammaGenerationId);

  if (resp.status === 'pending') {
    // last_polled_at was already bumped by the lease claim; just return.
    return claimed[0] ?? job;
  }

  if (resp.status === 'failed') {
    const [updated] = await db
      .update(gammaGenerationJobs)
      .set({
        status: 'failed',
        errorMessage: resp.error?.message ?? 'Gamma reported the generation failed',
        completedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(
        and(eq(gammaGenerationJobs.id, jobId), eq(gammaGenerationJobs.status, 'pending')),
      )
      .returning();
    return updated ?? claimed[0] ?? job;
  }

  // status === 'completed' — stream the .pptx into R2 (best-effort) and stamp
  // the presentation row. R2 writes are tolerated: if they fail we log the
  // error but still mark the job completed so the user has the gammaUrl.
  let fileAssetId: string | null = null;
  if (r2 && job.presentationId && job.requestedById) {
    try {
      const exportRes = await fetchExport(resp.exportUrl, { method: 'GET' });
      if (!exportRes.ok || !exportRes.body) {
        throw new Error(`exportUrl ${exportRes.status}`);
      }
      const r2Key = `courses/${job.courseId}/gamma/${job.id}.pptx`;
      const contentType =
        exportRes.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      await r2.put(r2Key, exportRes.body, {
        httpMetadata: { contentType },
      });
      const sizeHeader = exportRes.headers.get('content-length');
      const size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;
      const [asset] = await db
        .insert(fileAssets)
        .values({
          ownerId: job.requestedById,
          courseId: job.courseId,
          bucket: bucketName,
          objectKey: r2Key,
          contentType,
          sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
          originalFilename: `${job.id}.pptx`,
          status: 'ready',
          relatedType: 'material',
        })
        .returning();
      fileAssetId = asset?.id ?? null;
    } catch (err) {
      console.error('gamma: failed to mirror .pptx into R2', { jobId, err });
      fileAssetId = null;
    }
  }

  if (job.presentationId) {
    await db
      .update(presentations)
      .set({
        externalUrl: resp.gammaUrl,
        provider: 'gamma',
        fileAssetId,
        updatedAt: nowIso,
      })
      .where(eq(presentations.id, job.presentationId));
  }

  // Final transition. Conditional on still being `pending` so a parallel
  // finalize (should one slip past the lease) can't write the same state
  // twice.
  const [updated] = await db
    .update(gammaGenerationJobs)
    .set({
      status: 'completed',
      gammaUrl: resp.gammaUrl,
      exportUrl: resp.exportUrl,
      creditsDeducted: resp.credits?.deducted ?? null,
      creditsRemaining: resp.credits?.remaining ?? null,
      completedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(and(eq(gammaGenerationJobs.id, jobId), eq(gammaGenerationJobs.status, 'pending')))
    .returning();
  return updated ?? claimed[0] ?? job;
}
