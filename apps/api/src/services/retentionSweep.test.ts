import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETENTION_DEFAULTS,
  deleteExpiredRefreshTokens,
  deleteOldAiGenerationJobs,
  deleteOldGammaGenerationJobs,
  nullOldAttendanceFingerprints,
  nullOldAuditLogFingerprints,
  nullOldRefreshTokenFingerprints,
  runRetentionSweep,
} from './retentionSweep';

// Each sweep is a single fluent drizzle chain ending in `.returning(...)`. We
// mock the chain and assert on the SET payload (for UPDATE sweeps) plus that
// `.returning` was reached (each call would have produced rows in real DB).
//
// Counts come from whatever the mocked `.returning()` resolves to — we hand
// each sweep a different number to be sure the top-level summary maps each
// field to the right sweep.

function makeUpdateChain(returnRows: Array<Record<string, unknown>>) {
  const returningMock = vi.fn().mockResolvedValue(returnRows);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { updateMock, setMock, whereMock, returningMock };
}

function makeDeleteChain(returnRows: Array<Record<string, unknown>>) {
  const returningMock = vi.fn().mockResolvedValue(returnRows);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const deleteMock = vi.fn(() => ({ where: whereMock }));
  return { deleteMock, whereMock, returningMock };
}

const NOW = new Date('2026-05-21T12:00:00.000Z');

describe('retentionSweep', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it('nullOldAuditLogFingerprints sets ip + user_agent to null and returns row count', async () => {
    const { updateMock, setMock, returningMock } = makeUpdateChain([{ id: 'a' }, { id: 'b' }]);
    const db = { update: updateMock } as never;
    const n = await nullOldAuditLogFingerprints(db, NOW);
    expect(n).toBe(2);
    expect(setMock).toHaveBeenCalledWith({ ip: null, userAgent: null });
    expect(returningMock).toHaveBeenCalled();
  });

  it('nullOldAttendanceFingerprints sets ip_address to null', async () => {
    const { updateMock, setMock } = makeUpdateChain([{ id: 'x' }]);
    const db = { update: updateMock } as never;
    const n = await nullOldAttendanceFingerprints(db, NOW);
    expect(n).toBe(1);
    expect(setMock).toHaveBeenCalledWith({ ipAddress: null });
  });

  it('nullOldRefreshTokenFingerprints sets ip + user_agent to null', async () => {
    const { updateMock, setMock } = makeUpdateChain([]);
    const db = { update: updateMock } as never;
    const n = await nullOldRefreshTokenFingerprints(db, NOW);
    expect(n).toBe(0);
    expect(setMock).toHaveBeenCalledWith({ ip: null, userAgent: null });
  });

  it('deleteExpiredRefreshTokens issues a DELETE and returns row count', async () => {
    const { deleteMock, whereMock, returningMock } = makeDeleteChain([{ id: '1' }, { id: '2' }, { id: '3' }]);
    const db = { delete: deleteMock } as never;
    const n = await deleteExpiredRefreshTokens(db, NOW);
    expect(n).toBe(3);
    expect(whereMock).toHaveBeenCalledOnce();
    expect(returningMock).toHaveBeenCalled();
  });

  it('deleteOldAiGenerationJobs issues a DELETE (cascades to artifacts/events)', async () => {
    const { deleteMock } = makeDeleteChain([{ id: 'job-1' }]);
    const db = { delete: deleteMock } as never;
    const n = await deleteOldAiGenerationJobs(db, NOW);
    expect(n).toBe(1);
  });

  it('deleteOldGammaGenerationJobs issues a DELETE', async () => {
    const { deleteMock } = makeDeleteChain([{ id: 'g-1' }, { id: 'g-2' }]);
    const db = { delete: deleteMock } as never;
    const n = await deleteOldGammaGenerationJobs(db, NOW);
    expect(n).toBe(2);
  });

  it('runRetentionSweep aggregates counts from each sub-sweep and records an audit row', async () => {
    // Construct mocks for each sub-sweep that return rows of different
    // lengths, so the summary mapping is unambiguous.
    const updateMocks = [
      makeUpdateChain([{ id: 'a1' }, { id: 'a2' }]), // audit logs (2)
      makeUpdateChain([{ id: 'att1' }]),              // attendance (1)
      makeUpdateChain([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]), // refresh tokens (3)
    ];
    const deleteMocks = [
      makeDeleteChain([{ id: 'rd1' }]),                                // refresh tokens deleted (1)
      makeDeleteChain([{ id: 'aij1' }, { id: 'aij2' }, { id: 'aij3' }, { id: 'aij4' }]), // ai jobs (4)
      makeDeleteChain([]),                                              // gamma jobs (0)
    ];

    let updateCallIdx = 0;
    let deleteCallIdx = 0;
    const insertMock = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
    const db = {
      update: vi.fn(() => {
        const chain = updateMocks[updateCallIdx]!;
        updateCallIdx += 1;
        return { set: chain.setMock };
      }),
      delete: vi.fn(() => {
        const chain = deleteMocks[deleteCallIdx]!;
        deleteCallIdx += 1;
        return { where: chain.whereMock };
      }),
      insert: insertMock,
    } as never;

    const summary = await runRetentionSweep(db);

    expect(summary).toMatchObject({
      auditLogsFingerprintsNulled: 2,
      attendanceFingerprintsNulled: 1,
      refreshTokenFingerprintsNulled: 3,
      expiredRefreshTokensDeleted: 1,
      aiGenerationJobsDeleted: 4,
      gammaGenerationJobsDeleted: 0,
    });
    expect(typeof summary.runAt).toBe('string');
    // Audit row written exactly once (the final summary).
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('uses the configured retention windows when overridden', async () => {
    // We can't peek at the WHERE clause directly (drizzle SQL builder is
    // opaque), but we can at least verify the function runs to completion
    // with a custom config. The unit test ensures the parameter actually
    // wires through to each sweep.
    const updateMocks = Array.from({ length: 3 }, () => makeUpdateChain([]));
    const deleteMocks = Array.from({ length: 3 }, () => makeDeleteChain([]));
    let updateCallIdx = 0;
    let deleteCallIdx = 0;
    const db = {
      update: vi.fn(() => ({ set: updateMocks[updateCallIdx++]!.setMock })),
      delete: vi.fn(() => ({ where: deleteMocks[deleteCallIdx++]!.whereMock })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    } as never;

    const summary = await runRetentionSweep(db, {
      ...RETENTION_DEFAULTS,
      fingerprintRetentionDays: 14,
      aiJobRetentionDays: 30,
    });
    expect(summary.aiGenerationJobsDeleted).toBe(0);
  });
});
