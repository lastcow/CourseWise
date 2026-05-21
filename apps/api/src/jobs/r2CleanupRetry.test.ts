import { describe, expect, it, vi } from 'vitest';
import { retryFailedR2CleanupJobs } from './r2CleanupRetry';

// runR2Cleanup is called per candidate. We mock the *db* chain at the
// retry-sweep level (the SELECT) and stub the R2 bucket so runR2Cleanup
// returns cleanly. That gives us end-to-end coverage of the retry path
// without dragging in real Neon.

function makeDbWithCandidates(candidates: Array<Record<string, unknown>>) {
  // The retry sweep does: db.select().from(table).where(...) → array.
  // runR2Cleanup (called per candidate) then does:
  //   db.update(table).set(...).where(...) — once at start, once at end.
  // Each update returns nothing the caller awaits.
  const whereSelectMock = vi.fn().mockResolvedValue(candidates);
  const fromMock = vi.fn(() => ({ where: whereSelectMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return {
    db: { select: selectMock, update: updateMock } as never,
    selectMock,
    fromMock,
    whereSelectMock,
    updateMock,
  };
}

function makeBucket(success: boolean): R2Bucket {
  // Two-call list/delete loop in runR2Cleanup: an empty list is enough to
  // bail. For failure we throw from `.list`.
  if (success) {
    return {
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket;
  }
  return {
    list: vi.fn().mockRejectedValue(new Error('bucket down')),
    delete: vi.fn(),
  } as unknown as R2Bucket;
}

describe('retryFailedR2CleanupJobs', () => {
  it('returns zero counts when no candidates exist', async () => {
    const { db } = makeDbWithCandidates([]);
    const bucket = makeBucket(true);
    const summary = await retryFailedR2CleanupJobs(db, bucket);
    expect(summary).toEqual({ retried: 0, succeeded: 0, stillFailing: 0 });
  });

  it('counts each successful retry exactly once', async () => {
    const { db } = makeDbWithCandidates([
      { id: 'job-1', courseId: 'course-1', status: 'failed', attempts: 1 },
      { id: 'job-2', courseId: 'course-2', status: 'failed', attempts: 2 },
    ]);
    const bucket = makeBucket(true);
    const summary = await retryFailedR2CleanupJobs(db, bucket);
    expect(summary.retried).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.stillFailing).toBe(0);
  });

  it('counts persistent failures into stillFailing without throwing', async () => {
    const { db } = makeDbWithCandidates([
      { id: 'job-1', courseId: 'course-1', status: 'failed', attempts: 2 },
    ]);
    const bucket = makeBucket(false);
    const summary = await retryFailedR2CleanupJobs(db, bucket);
    expect(summary.retried).toBe(1);
    expect(summary.succeeded).toBe(0);
    expect(summary.stillFailing).toBe(1);
  });
});
