import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTENDANCE_AUTO_CLOSE_AFTER_HOURS,
  attendanceAutoCloseCutoff,
  closeExpiredAttendanceSessions,
} from './attendanceSessionSweep';

// The close is a single fluent drizzle chain `update().set().where().returning()`.
// Mock the chain, assert on the SET payload, and let `.returning()` resolve the
// rows that drive the closed count. A separate `insert` mock stands in for the
// audit row written by recordAudit.
function makeDb(closedRows: Array<{ id: string }>) {
  const returningMock = vi.fn().mockResolvedValue(closedRows);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const db = { update: updateMock, insert: insertMock } as never;
  return { db, updateMock, setMock, whereMock, returningMock, insertMock };
}

const NOW = new Date('2026-06-07T04:00:00.000Z');

describe('attendanceAutoCloseCutoff', () => {
  it('is exactly 24 hours before now', () => {
    expect(ATTENDANCE_AUTO_CLOSE_AFTER_HOURS).toBe(24);
    // 04:00 on 2026-06-07 → 04:00 on 2026-06-06.
    expect(attendanceAutoCloseCutoff(NOW)).toBe('2026-06-06T04:00:00.000Z');
  });
});

describe('closeExpiredAttendanceSessions', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flips stale open sessions to closed and returns the count', async () => {
    const { db, setMock, returningMock } = makeDb([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const summary = await closeExpiredAttendanceSessions(db);
    expect(summary).toEqual({ closed: 3 });
    expect(setMock).toHaveBeenCalledWith({
      status: 'closed',
      closedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(returningMock).toHaveBeenCalled();
  });

  it('records a single system audit row when sessions were closed', async () => {
    const { db, insertMock } = makeDb([{ id: 'a' }]);
    await closeExpiredAttendanceSessions(db);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('returns zero and skips the audit row when nothing is stale', async () => {
    const { db, insertMock } = makeDb([]);
    const summary = await closeExpiredAttendanceSessions(db);
    expect(summary).toEqual({ closed: 0 });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('honours an injected clock for the cutoff', async () => {
    const { db, setMock } = makeDb([{ id: 'a' }]);
    const fixed = new Date('2026-01-15T09:30:00.000Z');
    await closeExpiredAttendanceSessions(db, fixed);
    expect(setMock).toHaveBeenCalledWith({
      status: 'closed',
      closedAt: fixed.toISOString(),
      updatedAt: fixed.toISOString(),
    });
  });
});
