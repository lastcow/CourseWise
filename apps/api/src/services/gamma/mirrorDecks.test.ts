import { describe, expect, it, vi } from 'vitest';
import { mirrorMissingDeckFiles } from './mirrorDecks';
import type { GammaClient } from './client';
import type { Db } from '../../db/client';
import { gammaGenerationJobs, presentations } from '../../db/schema';

interface PresRow {
  id: string;
  fileAssetId: string | null;
}
interface JobRow {
  id: string;
  presentationId: string;
  requestedById: string | null;
  status: string;
  gammaGenerationId: string | null;
  exportUrl: string | null;
  completedAt: string | null;
}

/**
 * Minimal drizzle stub covering only the chains mirrorMissingDeckFiles uses:
 *   select().from(presentations).where()                  → all seeded rows
 *   select().from(gammaGenerationJobs).where().orderBy().limit() → seeded jobs
 *   insert(fileAssets).values().returning()
 *   update(presentations).set().where()
 * Predicates are opaque; tests seed pre-filtered rows.
 */
function makeDb(data: { presentations: PresRow[]; jobs: JobRow[] }) {
  const insertedAssets: Array<Record<string, unknown>> = [];
  const presentationUpdates: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === presentations) {
          return { where: () => Promise.resolve(data.presentations) };
        }
        if (table === gammaGenerationJobs) {
          return {
            where: () => ({
              orderBy: () => ({ limit: (n: number) => Promise.resolve(data.jobs.slice(0, n)) }),
            }),
          };
        }
        throw new Error('unexpected table');
      },
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          const row = { ...v, id: `asset-${insertedAssets.length + 1}` };
          insertedAssets.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          presentationUpdates.push(v);
          return Promise.resolve([]);
        },
      }),
    }),
  };
  return { db: db as unknown as Db, insertedAssets, presentationUpdates };
}

function makeR2() {
  return { put: vi.fn(async () => ({})) } as unknown as R2Bucket & { put: ReturnType<typeof vi.fn> };
}

function pptxResponse(): Response {
  return new Response('PPT-BYTES', {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'content-length': '9',
    },
  });
}

const PRES: PresRow = { id: 'pres-1', fileAssetId: null };
const JOB: JobRow = {
  id: 'job-1',
  presentationId: 'pres-1',
  requestedById: 'teacher-1',
  status: 'completed',
  gammaGenerationId: 'gen-1',
  exportUrl: 'https://gamma.example/export/stored.pptx',
  completedAt: '2026-06-01T00:00:00.000Z',
};

describe('mirrorMissingDeckFiles', () => {
  it('mirrors a deck from the stored exportUrl into R2 and stamps the presentation', async () => {
    const { db, insertedAssets, presentationUpdates } = makeDb({
      presentations: [PRES],
      jobs: [JOB],
    });
    const r2 = makeR2();
    const fetchExport = vi.fn(async () => pptxResponse());

    const mirrored = await mirrorMissingDeckFiles('course-1', {
      db,
      r2,
      bucketName: 'coursewise-files',
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(mirrored).toBe(1);
    expect(fetchExport).toHaveBeenCalledWith('https://gamma.example/export/stored.pptx');
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.put.mock.calls[0]![0]).toBe('courses/course-1/gamma/job-1.pptx');
    expect(insertedAssets[0]).toMatchObject({
      courseId: 'course-1',
      objectKey: 'courses/course-1/gamma/job-1.pptx',
      originalFilename: 'job-1.pptx',
      status: 'ready',
      relatedType: 'material',
      sizeBytes: 9,
    });
    expect(presentationUpdates[0]).toMatchObject({ fileAssetId: 'asset-1' });
  });

  it('asks Gamma for a fresh exportUrl when the stored link is dead', async () => {
    const { db, presentationUpdates } = makeDb({ presentations: [PRES], jobs: [JOB] });
    const r2 = makeR2();
    const fetchExport = vi.fn(async (url: string) =>
      url === JOB.exportUrl ? new Response(null, { status: 410 }) : pptxResponse(),
    );
    const client = {
      getGeneration: vi.fn(async () => ({
        generationId: 'gen-1',
        status: 'completed' as const,
        gammaUrl: 'https://gamma.app/docs/x',
        exportUrl: 'https://gamma.example/export/fresh.pptx',
      })),
    } as unknown as GammaClient & { getGeneration: ReturnType<typeof vi.fn> };

    const mirrored = await mirrorMissingDeckFiles('course-1', {
      db,
      r2,
      bucketName: 'coursewise-files',
      client,
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(mirrored).toBe(1);
    expect(client.getGeneration).toHaveBeenCalledWith('gen-1');
    expect(fetchExport).toHaveBeenLastCalledWith('https://gamma.example/export/fresh.pptx');
    expect(presentationUpdates[0]).toMatchObject({ fileAssetId: 'asset-1' });
  });

  it('skips presentations with no completed generation', async () => {
    const { db, insertedAssets } = makeDb({ presentations: [PRES], jobs: [] });
    const r2 = makeR2();
    const fetchExport = vi.fn();

    const mirrored = await mirrorMissingDeckFiles('course-1', {
      db,
      r2,
      bucketName: 'coursewise-files',
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(mirrored).toBe(0);
    expect(fetchExport).not.toHaveBeenCalled();
    expect(insertedAssets).toHaveLength(0);
  });

  it('never throws when the download fails everywhere (no client to refresh)', async () => {
    const { db, insertedAssets } = makeDb({ presentations: [PRES], jobs: [JOB] });
    const r2 = makeR2();
    const fetchExport = vi.fn(async () => new Response(null, { status: 410 }));

    const mirrored = await mirrorMissingDeckFiles('course-1', {
      db,
      r2,
      bucketName: 'coursewise-files',
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(mirrored).toBe(0);
    expect(insertedAssets).toHaveLength(0);
    expect(r2.put).not.toHaveBeenCalled();
  });
});
