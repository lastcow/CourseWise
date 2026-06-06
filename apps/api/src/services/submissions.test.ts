import { describe, expect, it } from 'vitest';
import {
  applyLatePenalty,
  clampScore,
  computeLatePenaltyPercent,
  determineSubmissionStatus,
} from './submissions';

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

describe('computeLatePenaltyPercent', () => {
  const deadline = '2026-05-01T12:00:00Z';
  const policy = { perPeriodPercent: 10, periodHours: 24, maxPercent: 50 };

  it('on time → 0', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-01T11:59:00Z', deadline, ...policy }),
    ).toBe(0);
  });

  it('one minute late counts as a started period → one period', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-01T12:01:00Z', deadline, ...policy }),
    ).toBe(10);
  });

  it('within the first period (23h) → still one period', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-02T11:00:00Z', deadline, ...policy }),
    ).toBe(10);
  });

  it('just past 24h → two periods', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-02T13:00:00Z', deadline, ...policy }),
    ).toBe(20);
  });

  it('caps at maxPercent', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-20T12:00:00Z', deadline, ...policy }),
    ).toBe(50);
  });

  it('no deadline → 0', () => {
    expect(
      computeLatePenaltyPercent({ submittedAt: '2026-05-20T12:00:00Z', deadline: null, ...policy }),
    ).toBe(0);
  });

  it('incomplete policy (no per-period percent) → 0', () => {
    expect(
      computeLatePenaltyPercent({
        submittedAt: '2026-05-02T13:00:00Z',
        deadline,
        perPeriodPercent: null,
        periodHours: 24,
        maxPercent: 50,
      }),
    ).toBe(0);
  });

  it('no cap → accrues unbounded by max', () => {
    expect(
      computeLatePenaltyPercent({
        submittedAt: '2026-05-04T11:00:00Z', // 71h late → 3 started days
        deadline,
        perPeriodPercent: 10,
        periodHours: 24,
        maxPercent: null,
      }),
    ).toBe(30);
  });
});

describe('applyLatePenalty', () => {
  it('deducts the percentage', () => {
    expect(applyLatePenalty(90, 20)).toBeCloseTo(72);
  });
  it('zero penalty passes through', () => {
    expect(applyLatePenalty(90, 0)).toBe(90);
  });
  it('100% penalty → 0', () => {
    expect(applyLatePenalty(90, 100)).toBe(0);
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
