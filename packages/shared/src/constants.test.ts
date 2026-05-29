import { describe, expect, it } from 'vitest';
import {
  SUBMISSION_GRADING_ORDER,
  SUBMISSION_STATUSES,
  submissionGradingRank,
  type SubmissionStatus,
} from './constants';

describe('submission grading order', () => {
  it('ranks submitted first, then late, returned, draft, graded last', () => {
    expect(SUBMISSION_GRADING_ORDER).toEqual(['submitted', 'late', 'returned', 'draft', 'graded']);
    expect(submissionGradingRank('submitted')).toBe(0);
    expect(submissionGradingRank('late')).toBe(1);
    expect(submissionGradingRank('returned')).toBe(2);
    expect(submissionGradingRank('draft')).toBe(3);
    expect(submissionGradingRank('graded')).toBe(4);
  });

  it('covers every submission status exactly once', () => {
    expect([...SUBMISSION_GRADING_ORDER].sort()).toEqual([...SUBMISSION_STATUSES].sort());
  });

  it('sorts a mixed list into grading priority', () => {
    const input: SubmissionStatus[] = ['graded', 'draft', 'submitted', 'returned', 'late'];
    const sorted = [...input].sort((a, b) => submissionGradingRank(a) - submissionGradingRank(b));
    expect(sorted).toEqual(['submitted', 'late', 'returned', 'draft', 'graded']);
  });
});
