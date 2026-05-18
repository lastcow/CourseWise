import { describe, expect, it } from 'vitest';
import {
  autoGradeAnswer,
  clampPoints,
  computeAttemptExpiry,
  isAutoGradedType,
  quizAttemptIsExpired,
} from './quizGrading';

describe('isAutoGradedType', () => {
  it('includes choice + true_false', () => {
    expect(isAutoGradedType('single_choice')).toBe(true);
    expect(isAutoGradedType('multiple_choice')).toBe(true);
    expect(isAutoGradedType('true_false')).toBe(true);
  });
  it('excludes subjective types', () => {
    expect(isAutoGradedType('short_answer')).toBe(false);
    expect(isAutoGradedType('case_analysis')).toBe(false);
  });
});

describe('autoGradeAnswer — single choice', () => {
  it('awards full points for an exact match', () => {
    const r = autoGradeAnswer({
      type: 'single_choice',
      correctAnswers: [1],
      studentAnswer: [1],
      points: 2,
    });
    expect(r).toEqual({ isCorrect: true, pointsAwarded: 2, needsReview: false });
  });
  it('awards 0 for a wrong pick', () => {
    const r = autoGradeAnswer({
      type: 'single_choice',
      correctAnswers: [1],
      studentAnswer: [0],
      points: 2,
    });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsAwarded).toBe(0);
  });
  it('rejects multi-select as wrong on single_choice', () => {
    const r = autoGradeAnswer({
      type: 'single_choice',
      correctAnswers: [1],
      studentAnswer: [0, 1],
      points: 2,
    });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsAwarded).toBe(0);
  });
  it('handles missing student answer', () => {
    const r = autoGradeAnswer({
      type: 'single_choice',
      correctAnswers: [1],
      studentAnswer: null,
      points: 2,
    });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsAwarded).toBe(0);
  });
});

describe('autoGradeAnswer — multiple choice', () => {
  it('requires exact set match (no partial credit)', () => {
    const exact = autoGradeAnswer({
      type: 'multiple_choice',
      correctAnswers: [0, 2],
      studentAnswer: [2, 0],
      points: 3,
    });
    expect(exact).toEqual({ isCorrect: true, pointsAwarded: 3, needsReview: false });
    const subset = autoGradeAnswer({
      type: 'multiple_choice',
      correctAnswers: [0, 2],
      studentAnswer: [0],
      points: 3,
    });
    expect(subset.isCorrect).toBe(false);
    expect(subset.pointsAwarded).toBe(0);
  });
});

describe('autoGradeAnswer — true_false', () => {
  it('compares booleans', () => {
    expect(
      autoGradeAnswer({
        type: 'true_false',
        correctAnswers: true,
        studentAnswer: true,
        points: 1,
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 1, needsReview: false });
    expect(
      autoGradeAnswer({
        type: 'true_false',
        correctAnswers: false,
        studentAnswer: 'true',
        points: 1,
      }).isCorrect,
    ).toBe(false);
  });
});

describe('autoGradeAnswer — subjective types', () => {
  it('holds for review', () => {
    const r = autoGradeAnswer({
      type: 'short_answer',
      correctAnswers: null,
      studentAnswer: 'anything',
      points: 5,
    });
    expect(r.needsReview).toBe(true);
    expect(r.pointsAwarded).toBeNull();
  });
});

describe('clampPoints', () => {
  it('clamps to [0, max]', () => {
    expect(clampPoints(5, 4)).toBe(4);
    expect(clampPoints(-1, 4)).toBe(0);
    expect(clampPoints(2.5, 4)).toBe(2.5);
  });
});

describe('quizAttemptIsExpired', () => {
  it('returns false for null expiry', () => {
    expect(quizAttemptIsExpired(null)).toBe(false);
  });
  it('returns true when past expiry', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(quizAttemptIsExpired(past)).toBe(true);
  });
});

describe('computeAttemptExpiry', () => {
  it('returns null with no constraints', () => {
    const r = computeAttemptExpiry({
      startedAt: new Date('2026-01-01T10:00:00Z'),
      timeLimitMinutes: null,
      endTime: null,
    });
    expect(r).toBeNull();
  });
  it('uses time limit when no endTime', () => {
    const r = computeAttemptExpiry({
      startedAt: new Date('2026-01-01T10:00:00Z'),
      timeLimitMinutes: 30,
      endTime: null,
    });
    expect(r?.toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
  it('returns earliest when both apply', () => {
    const r = computeAttemptExpiry({
      startedAt: new Date('2026-01-01T10:00:00Z'),
      timeLimitMinutes: 60,
      endTime: '2026-01-01T10:30:00.000Z',
    });
    expect(r?.toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
});
