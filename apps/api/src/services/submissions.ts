import type { SubmissionStatus } from '@coursewise/shared';

/**
 * Late detection per spec:
 *   isLate = assignment.dueDate != null
 *         && submittedAt > assignment.dueDate
 *         && !assignment.allowLateSubmission
 *   status = isLate ? 'LATE' : 'SUBMITTED'
 *
 * If `allowLateSubmission=true` and past dueDate, the status stays `SUBMITTED`;
 * the UI shows a late badge based on the timestamp.
 */
export function determineSubmissionStatus(args: {
  submittedAt: Date | string;
  dueDate: Date | string | null | undefined;
  allowLateSubmission: boolean;
}): SubmissionStatus {
  const { submittedAt, dueDate, allowLateSubmission } = args;
  if (!dueDate) return 'submitted';
  const submittedMs =
    submittedAt instanceof Date ? submittedAt.getTime() : new Date(submittedAt).getTime();
  const dueMs = dueDate instanceof Date ? dueDate.getTime() : new Date(dueDate).getTime();
  if (submittedMs > dueMs && !allowLateSubmission) return 'late';
  return 'submitted';
}

export function clampScore(score: number, maxScore: number | null | undefined): number {
  if (typeof maxScore !== 'number' || Number.isNaN(maxScore)) {
    return Math.max(0, score);
  }
  return Math.max(0, Math.min(score, maxScore));
}
