import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { fileAssets, gammaGenerationJobs, presentations } from '../../db/schema';
import type { GammaClient } from './client';

export interface MirrorDecksDeps {
  db: Db;
  r2: R2Bucket;
  bucketName: string;
  /** When present, used to fetch a fresh exportUrl if the stored one expired. */
  client?: GammaClient;
  fetchExport?: typeof fetch; // injectable for tests
}

/**
 * Backfill missing deck files for a course: any presentation without a stored
 * file whose Gamma generation completed gets its .pptx downloaded (stored
 * exportUrl first, then a fresh one via the API when that link has expired)
 * and mirrored into R2 + `file_assets`, stamping `presentations.fileAssetId`.
 *
 * This is the same healing the generation poller does at completion time
 * (services/gamma/poll.ts) but for decks whose mirror failed or predates it —
 * run before a course export so the ZIP contains the PPT files; it also makes
 * the in-app Download button appear for those decks. Every failure is logged
 * and skipped so a dead link never blocks the caller. Returns the number of
 * decks mirrored.
 */
export async function mirrorMissingDeckFiles(
  courseId: string,
  deps: MirrorDecksDeps,
): Promise<number> {
  const { db, r2, bucketName, client, fetchExport = fetch } = deps;
  const rows = await db
    .select()
    .from(presentations)
    .where(and(eq(presentations.courseId, courseId), isNull(presentations.fileAssetId)));
  let mirrored = 0;
  for (const p of rows) {
    try {
      const [job] = await db
        .select()
        .from(gammaGenerationJobs)
        .where(
          and(
            eq(gammaGenerationJobs.presentationId, p.id),
            eq(gammaGenerationJobs.status, 'completed'),
          ),
        )
        .orderBy(desc(gammaGenerationJobs.completedAt))
        .limit(1);
      // No completed Gamma generation → nothing downloadable (e.g. a deck
      // that only ever existed as an external link).
      if (!job) continue;

      let exportRes = job.exportUrl
        ? await fetchExport(job.exportUrl).catch(() => null)
        : null;
      if ((!exportRes || !exportRes.ok || !exportRes.body) && client && job.gammaGenerationId) {
        // Stored link expired — ask Gamma for a fresh one.
        const gen = await client.getGeneration(job.gammaGenerationId);
        if (gen.status === 'completed' && gen.exportUrl) {
          exportRes = await fetchExport(gen.exportUrl).catch(() => null);
        }
      }
      if (!exportRes || !exportRes.ok || !exportRes.body) {
        console.error('gamma: deck mirror skipped — no downloadable export', {
          presentationId: p.id,
          jobId: job.id,
        });
        continue;
      }

      const contentType =
        exportRes.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      const r2Key = `courses/${courseId}/gamma/${job.id}.pptx`;
      await r2.put(r2Key, exportRes.body, { httpMetadata: { contentType } });
      const sizeHeader = exportRes.headers.get('content-length');
      const size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;
      const [asset] = await db
        .insert(fileAssets)
        .values({
          ownerId: job.requestedById,
          courseId,
          bucket: bucketName,
          objectKey: r2Key,
          contentType,
          sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
          originalFilename: `${job.id}.pptx`,
          status: 'ready',
          relatedType: 'material',
        })
        .returning();
      if (!asset) continue;
      await db
        .update(presentations)
        .set({ fileAssetId: asset.id, updatedAt: new Date().toISOString() })
        .where(eq(presentations.id, p.id));
      mirrored++;
    } catch (err) {
      console.error('gamma: deck mirror failed', { presentationId: p.id, err });
    }
  }
  return mirrored;
}
