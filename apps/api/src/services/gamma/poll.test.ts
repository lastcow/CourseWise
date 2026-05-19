import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollAndFinalize, type PollDeps } from './poll';
import type { GammaClient, GammaGetGenerationResponse } from './client';
import {
  fileAssets,
  gammaGenerationJobs,
  presentations,
} from '../../db/schema';

/**
 * Shape of one row in our in-memory job table for the tests. Mirrors the
 * `gammaGenerationJobs` drizzle schema closely enough for `pollAndFinalize`
 * to operate on it.
 */
interface JobRow {
  id: string;
  courseId: string;
  presentationId: string | null;
  requestedById: string | null;
  status: 'pending' | 'completed' | 'failed';
  gammaGenerationId: string | null;
  gammaUrl: string | null;
  exportUrl: string | null;
  errorMessage: string | null;
  materialIds: string[];
  requestParams: Record<string, unknown>;
  creditsDeducted: number | null;
  creditsRemaining: number | null;
  lastPolledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PresentationRow {
  id: string;
  externalUrl: string | null;
  provider: string | null;
  fileAssetId: string | null;
  updatedAt: string;
}

interface FileAssetRow {
  id: string;
  ownerId: string;
  courseId: string;
  bucket: string;
  objectKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  originalFilename: string;
  status: string;
  relatedType: string | null;
}

/**
 * Minimal drizzle stub that implements only the call chains exercised by
 * `pollAndFinalize`:
 *   db.select().from(table).where(predicate).limit(n)
 *   db.update(table).set(values).where(predicate)[.returning()]
 *   db.insert(table).values(rows).returning()
 *
 * We key tables by reference (drizzle exports them as singletons) so a single
 * stub covers `gammaGenerationJobs`, `presentations`, and `fileAssets`.
 */
function makeDb(opts: {
  jobs: JobRow[];
  presentations: PresentationRow[];
  fileAssets: FileAssetRow[];
}) {
  const tables = new Map<unknown, unknown[]>([
    [gammaGenerationJobs, opts.jobs as unknown[]],
    [presentations, opts.presentations as unknown[]],
    [fileAssets, opts.fileAssets as unknown[]],
  ]);

  // Predicates from drizzle are opaque to us; we approximate by matching on the
  // single row most recently selected. The poll function always reads the job
  // by id first and never branches off that, so this is enough.
  let lastSelectedJobId: string | null = null;

  return {
    select: () => ({
      from: (table: unknown) => ({
        where: (_pred: unknown) => ({
          limit: (_n: number) => {
            const rows = tables.get(table) ?? [];
            if (table === gammaGenerationJobs) {
              // Tests always select by id; return whatever job is in the table.
              const row = rows[0] as JobRow | undefined;
              if (row) lastSelectedJobId = row.id;
              return Promise.resolve(row ? [row] : []);
            }
            return Promise.resolve(rows.slice(0, 1));
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (_pred: unknown) => {
          const rows = tables.get(table) as Record<string, unknown>[];
          // Apply patch to the single addressed row.
          const targetId =
            table === gammaGenerationJobs
              ? lastSelectedJobId
              : (rows[0]?.id as string | undefined) ?? null;
          const idx = rows.findIndex((r) => r.id === targetId);
          if (idx !== -1) {
            rows[idx] = { ...rows[idx], ...patch };
          }
          return {
            returning: () =>
              Promise.resolve(idx !== -1 ? [rows[idx]] : []),
            then: (resolve: (v: unknown) => unknown) => resolve(undefined),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (rowOrRows: unknown) => {
        const rows = tables.get(table) as Record<string, unknown>[];
        const arr = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const inserted = arr.map((r, i) => ({
          id: `inserted-${rows.length + i + 1}`,
          ...(r as Record<string, unknown>),
        }));
        rows.push(...inserted);
        return {
          returning: () => Promise.resolve(inserted),
        };
      },
    }),
  } as unknown as PollDeps['db'];
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-1',
    courseId: 'course-1',
    presentationId: 'pres-1',
    requestedById: 'user-1',
    status: 'pending',
    gammaGenerationId: 'gen_abc',
    gammaUrl: null,
    exportUrl: null,
    errorMessage: null,
    materialIds: ['mat-1'],
    requestParams: { title: 'x' },
    creditsDeducted: null,
    creditsRemaining: null,
    lastPolledAt: null,
    completedAt: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

function makeClient(
  impl: (id: string) => Promise<GammaGetGenerationResponse>,
): { client: GammaClient; getGeneration: ReturnType<typeof vi.fn> } {
  const getGeneration = vi.fn(impl);
  const client = { getGeneration } as unknown as GammaClient;
  return { client, getGeneration };
}

function makeR2() {
  return { put: vi.fn().mockResolvedValue(undefined) };
}

const NOW = new Date('2026-05-19T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pollAndFinalize', () => {
  it('returns the job unchanged when lastPolledAt is too recent (throttled)', async () => {
    const recent = new Date(NOW.getTime() - 1_000).toISOString();
    const job = makeJob({ lastPolledAt: recent });
    const db = makeDb({ jobs: [job], presentations: [], fileAssets: [] });
    const { client, getGeneration } = makeClient(async () => {
      throw new Error('should not be called');
    });

    const out = await pollAndFinalize('job-1', {
      db,
      client,
      r2: makeR2() as unknown as R2Bucket,
      bucketName: 'coursewise-files',
      now: () => NOW,
    });

    expect(getGeneration).not.toHaveBeenCalled();
    expect(out.status).toBe('pending');
    expect(out.lastPolledAt).toBe(recent);
  });

  it('calls Gamma when lastPolledAt is null and persists `pending` with new lastPolledAt', async () => {
    const job = makeJob({ lastPolledAt: null });
    const db = makeDb({ jobs: [job], presentations: [], fileAssets: [] });
    const { client, getGeneration } = makeClient(async (id) => ({
      generationId: id,
      status: 'pending',
    }));

    const out = await pollAndFinalize('job-1', {
      db,
      client,
      r2: makeR2() as unknown as R2Bucket,
      bucketName: 'coursewise-files',
      now: () => NOW,
    });

    expect(getGeneration).toHaveBeenCalledWith('gen_abc');
    expect(out.status).toBe('pending');
    expect(out.lastPolledAt).toBe(NOW_ISO);
  });

  it('marks the job failed with the upstream error message', async () => {
    const job = makeJob({ lastPolledAt: null });
    const db = makeDb({ jobs: [job], presentations: [], fileAssets: [] });
    const { client } = makeClient(async (id) => ({
      generationId: id,
      status: 'failed',
      error: { message: 'inputText too short' },
    }));

    const out = await pollAndFinalize('job-1', {
      db,
      client,
      r2: makeR2() as unknown as R2Bucket,
      bucketName: 'coursewise-files',
      now: () => NOW,
    });

    expect(out.status).toBe('failed');
    expect(out.errorMessage).toBe('inputText too short');
    expect(out.completedAt).toBe(NOW_ISO);
  });

  it('on completed: writes pptx to R2, inserts file_assets row, stamps the presentation, marks job completed', async () => {
    const job = makeJob({
      lastPolledAt: null,
      presentationId: 'pres-1',
      requestedById: 'user-1',
      courseId: 'course-1',
    });
    const presRow: PresentationRow = {
      id: 'pres-1',
      externalUrl: null,
      provider: null,
      fileAssetId: null,
      updatedAt: '2026-05-19T00:00:00.000Z',
    };
    const dbStore = {
      jobs: [job],
      presentations: [presRow],
      fileAssets: [] as FileAssetRow[],
    };
    const db = makeDb(dbStore);
    const { client } = makeClient(async (id) => ({
      generationId: id,
      status: 'completed',
      gammaUrl: 'https://gamma.app/docs/abc',
      exportUrl: 'https://files.gamma.app/abc.pptx',
      credits: { deducted: 5, remaining: 95 },
    }));

    const r2 = makeR2();
    // Stream a fake .pptx body; ReadableStream is fine in Node 18+/vitest.
    const exportBody = new Response('PPTX-BYTES', {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'content-length': '10',
      },
    });
    const fetchExport = vi.fn().mockResolvedValue(exportBody);

    const out = await pollAndFinalize('job-1', {
      db,
      client,
      r2: r2 as unknown as R2Bucket,
      bucketName: 'coursewise-files',
      now: () => NOW,
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(fetchExport).toHaveBeenCalledWith(
      'https://files.gamma.app/abc.pptx',
      { method: 'GET' },
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    const [key, body, putOpts] = r2.put.mock.calls[0]!;
    expect(key).toBe('courses/course-1/gamma/job-1.pptx');
    expect(body).toBeTruthy();
    expect(putOpts).toMatchObject({
      httpMetadata: {
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    });

    // file_assets row was inserted with the right shape.
    expect(dbStore.fileAssets).toHaveLength(1);
    expect(dbStore.fileAssets[0]).toMatchObject({
      ownerId: 'user-1',
      courseId: 'course-1',
      bucket: 'coursewise-files',
      objectKey: 'courses/course-1/gamma/job-1.pptx',
      originalFilename: 'job-1.pptx',
      status: 'ready',
      relatedType: 'material',
      sizeBytes: 10,
    });

    // presentation got externalUrl + provider + fileAssetId.
    expect(dbStore.presentations[0]).toMatchObject({
      id: 'pres-1',
      externalUrl: 'https://gamma.app/docs/abc',
      provider: 'gamma',
    });
    expect(dbStore.presentations[0]!.fileAssetId).toBeTruthy();

    // job marked completed with gamma metadata.
    expect(out.status).toBe('completed');
    expect(out.gammaUrl).toBe('https://gamma.app/docs/abc');
    expect(out.exportUrl).toBe('https://files.gamma.app/abc.pptx');
    expect(out.creditsDeducted).toBe(5);
    expect(out.creditsRemaining).toBe(95);
    expect(out.completedAt).toBe(NOW_ISO);
  });

  it('still completes the job when the R2 mirror fails (logs and continues)', async () => {
    const job = makeJob({
      lastPolledAt: null,
      presentationId: 'pres-1',
      requestedById: 'user-1',
    });
    const presRow: PresentationRow = {
      id: 'pres-1',
      externalUrl: null,
      provider: null,
      fileAssetId: null,
      updatedAt: '2026-05-19T00:00:00.000Z',
    };
    const dbStore = {
      jobs: [job],
      presentations: [presRow],
      fileAssets: [] as FileAssetRow[],
    };
    const db = makeDb(dbStore);
    const { client } = makeClient(async (id) => ({
      generationId: id,
      status: 'completed',
      gammaUrl: 'https://gamma.app/docs/abc',
      exportUrl: 'https://files.gamma.app/abc.pptx',
    }));

    const r2 = { put: vi.fn().mockRejectedValue(new Error('R2 down')) };
    const fetchExport = vi.fn().mockResolvedValue(
      new Response('bytes', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );

    const out = await pollAndFinalize('job-1', {
      db,
      client,
      r2: r2 as unknown as R2Bucket,
      bucketName: 'coursewise-files',
      now: () => NOW,
      fetchExport: fetchExport as unknown as typeof fetch,
    });

    expect(out.status).toBe('completed');
    expect(out.gammaUrl).toBe('https://gamma.app/docs/abc');
    expect(dbStore.presentations[0]).toMatchObject({
      externalUrl: 'https://gamma.app/docs/abc',
      provider: 'gamma',
      fileAssetId: null,
    });
    expect(dbStore.fileAssets).toHaveLength(0);
  });
});
