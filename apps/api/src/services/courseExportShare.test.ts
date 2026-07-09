import { describe, expect, it } from 'vitest';
import {
  clampMaxDownloads,
  clampTtlHours,
  computeShareExpiry,
  evaluateShareState,
  SHARE_DEFAULT_MAX_DOWNLOADS,
  SHARE_DEFAULT_TTL_HOURS,
  SHARE_MAX_TTL_HOURS,
} from './courseExportShare';

const NOW = Date.parse('2026-07-09T00:00:00.000Z');
const doneJob = { objectKey: 'courses/c/exports/j.zip', status: 'done', expiresAt: null };

function share(overrides: Partial<Parameters<typeof evaluateShareState>[0]> = {}) {
  return {
    revokedAt: null,
    lockedAt: null,
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
    downloadCount: 0,
    maxDownloads: 10,
    ...overrides,
  };
}

describe('clampTtlHours', () => {
  it('defaults when unset and caps at the max', () => {
    expect(clampTtlHours(null)).toBe(SHARE_DEFAULT_TTL_HOURS);
    expect(clampTtlHours(0)).toBe(SHARE_DEFAULT_TTL_HOURS);
    expect(clampTtlHours(999)).toBe(SHARE_MAX_TTL_HOURS);
    expect(clampTtlHours(12)).toBe(12);
  });
});

describe('clampMaxDownloads', () => {
  it('defaults when unset and floors/caps', () => {
    expect(clampMaxDownloads(null)).toBe(SHARE_DEFAULT_MAX_DOWNLOADS);
    expect(clampMaxDownloads(5.9)).toBe(5);
    expect(clampMaxDownloads(99999)).toBe(1000);
  });
});

describe('computeShareExpiry', () => {
  it('is now + clamped TTL when no job expiry', () => {
    expect(computeShareExpiry(NOW, 2, null)).toBe(new Date(NOW + 2 * 3_600_000).toISOString());
  });
  it('never outlives the export file', () => {
    const jobExpiry = new Date(NOW + 3_600_000).toISOString(); // 1h
    // Requested 24h, but the file dies in 1h → clamp to 1h.
    expect(computeShareExpiry(NOW, 24, jobExpiry)).toBe(jobExpiry);
  });
});

describe('evaluateShareState (priority order)', () => {
  it('accepts a fresh share on a done job', () => {
    expect(evaluateShareState(share(), doneJob, NOW)).toEqual({ ok: true });
  });
  it('rejects revoked before anything else', () => {
    expect(evaluateShareState(share({ revokedAt: '2026-07-09T00:00:00Z' }), doneJob, NOW)).toEqual({
      ok: false,
      error: 'revoked',
    });
  });
  it('rejects locked', () => {
    expect(evaluateShareState(share({ lockedAt: '2026-07-09T00:00:00Z' }), doneJob, NOW)).toEqual({
      ok: false,
      error: 'locked',
    });
  });
  it('rejects expired', () => {
    expect(
      evaluateShareState(share({ expiresAt: new Date(NOW - 1000).toISOString() }), doneJob, NOW),
    ).toEqual({ ok: false, error: 'expired' });
  });
  it('rejects exhausted at the download cap', () => {
    expect(
      evaluateShareState(share({ downloadCount: 10, maxDownloads: 10 }), doneJob, NOW),
    ).toEqual({ ok: false, error: 'exhausted' });
  });
  it('rejects when the job is missing / not done / has no object', () => {
    expect(evaluateShareState(share(), null, NOW)).toEqual({ ok: false, error: 'job_unavailable' });
    expect(
      evaluateShareState(share(), { objectKey: null, status: 'running', expiresAt: null }, NOW),
    ).toEqual({ ok: false, error: 'job_unavailable' });
  });
  it('rejects when the export file itself has expired', () => {
    expect(
      evaluateShareState(
        share(),
        { ...doneJob, expiresAt: new Date(NOW - 1000).toISOString() },
        NOW,
      ),
    ).toEqual({ ok: false, error: 'job_unavailable' });
  });
});
