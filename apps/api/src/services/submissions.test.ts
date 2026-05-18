import { describe, expect, it } from 'vitest';
import { clampScore, determineSubmissionStatus } from './submissions';

describe('determineSubmissionStatus', () => {
  const dueDate = '2026-05-01T12:00:00Z';

  it('on time → SUBMITTED', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-01T11:59:00Z',
        dueDate,
        allowLateSubmission: false,
      }),
    ).toBe('submitted');
  });

  it('past due, late allowed → SUBMITTED (UI shows badge)', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-02T00:00:00Z',
        dueDate,
        allowLateSubmission: true,
      }),
    ).toBe('submitted');
  });

  it('past due, late not allowed → LATE', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-02T00:00:00Z',
        dueDate,
        allowLateSubmission: false,
      }),
    ).toBe('late');
  });

  it('null dueDate → SUBMITTED', () => {
    expect(
      determineSubmissionStatus({
        submittedAt: '2026-05-02T00:00:00Z',
        dueDate: null,
        allowLateSubmission: false,
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
