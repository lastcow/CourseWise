import { describe, expect, it } from 'vitest';
import { clampScore, determineSubmissionStatus } from './submissions';

describe('determineSubmissionStatus', () => {
  const dueDate = '2026-05-01T12:00:00Z';

  it('on time → SUBMITTED', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-01T11:59:00Z',
        dueDate,
      }),
    ).toBe('submitted');
  });

  it('past the deadline → LATE (flagged so teachers can deduct)', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-02T00:00:00Z',
        dueDate,
      }),
    ).toBe('late');
  });

  it('null deadline → SUBMITTED', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-02T00:00:00Z',
        dueDate: null,
      }),
    ).toBe('submitted');
  });
});

describe('clampScore', () => {
  it('clamps above maxScore', () => {
    expect(clampScore(15, 10)).toBe(10);
  });
  it('clamps below 0', () => {
    expect(clampScore(-3, 10)).toBe(0);
  });
  it('passes a valid score through', () => {
    expect(clampScore(7.5, 10)).toBe(7.5);
  });
  it('treats null maxScore as no upper bound', () => {
    expect(clampScore(1000, null)).toBe(1000);
    expect(clampScore(-5, null)).toBe(0);
  });
});
