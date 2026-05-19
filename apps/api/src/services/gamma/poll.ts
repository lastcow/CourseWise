import { eq } from 'drizzle-orm';
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
 */
export async function pollAndFinalize(jobId: string, deps: PollDeps) {
  const { db, client, r2, bucketName, fetchExport = fetch } = deps;
  const now = (deps.now ?? (() => new Date()))();

  const [job] = await db
    .select()
    .from(gammaGenerationJobs)
    .where(eq(gammaGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Gamma job not found');
  if (job.status !== 'pending' || !job.gammaGenerationId) return job;

  // Per-job rate limit: ≥ MIN_POLL_GAP_MS between Gamma calls.
  if (job.lastPolledAt) {
    const gap = now.getTime() - new Date(job.lastPolledAt).getTime();
    if (gap < MIN_POLL_GAP_MS) return job;
  }

  let resp: GammaGetGenerationResponse;
  try {
    resp = await client.getGeneration(job.gammaGenerationId);
  } catch (err) {
    // Don't fail the job on a transient upstream error — record the time and
    // let the next poll retry.
    await db
      .update(gammaGenerationJobs)
      .set({ lastPolledAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(gammaGenerationJobs.id, jobId));
    throw err;
  }

  if (resp.status === 'pending') {
    const [updated] = await db
      .update(gammaGenerationJobs)
      .set({ lastPolledAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(gammaGenerationJobs.id, jobId))
      .returning();
    return updated ?? job;
  }

  if (resp.status === 'failed') {
    const [updated] = await db
      .update(gammaGenerationJobs)
      .set({
        status: 'failed',
        errorMessage: resp.error?.message ?? 'Gamma reported the generation failed',
        lastPolledAt: now.toISOString(),
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(eq(gammaGenerationJobs.id, jobId))
      .returning();
    return updated ?? job;
  }

  // status === 'completed' — stream the .pptx into R2 (best-effort) and stamp
  // the presentation row. R2 writes are tolerated: if they fail we log the
  // error but still mark the job completed and update the presentation
  // `external_url` so the user has the share link.
  let fileAssetId: string | null = null;
  if (r2 && job.presentationId && job.requestedById) {
    try {
      const exportRes = await fetchExport(resp.exportUrl, { method: 'GET' });
      if (!exportRes.ok || !exportRes.body) {
        throw new Error(`exportUrl ${exportRes.status}`);
      }
      const r2Key = `courses/${job.courseId}/gamma/${job.id}/${job.id}.pptx`;
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
        updatedAt: now.toISOString(),
      })
      .where(eq(presentations.id, job.presentationId));
  }

  const [updated] = await db
    .update(gammaGenerationJobs)
    .set({
      status: 'completed',
      gammaUrl: resp.gammaUrl,
      exportUrl: resp.exportUrl,
      creditsDeducted: resp.credits?.deducted ?? null,
      creditsRemaining: resp.credits?.remaining ?? null,
      lastPolledAt: now.toISOString(),
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(eq(gammaGenerationJobs.id, jobId))
    .returning();
  return updated ?? job;
}
