import type { SubmissionStatus } from '@coursewise/shared';

/**
 * Late detection: a submission is LATE when it lands after the assignment's
 * deadline, period — the flag is about *timing*, not permission.
 *
 *   isLate = deadline != null && submittedAt > deadline
 *   status = isLate ? 'LATE' : 'SUBMITTED'
 *
 * `allowLateSubmission` governs whether a late submission is *accepted* at all
 * (enforced by the scheduling gates in the routes), NOT whether it's flagged.
 * Callers pass the effective deadline (dueDate, falling back to the scheduling
 * window) so teachers can still see — and deduct for — late work that was
 * allowed through.
 */
export function determineSubmissionStatus(args: {
  submittedAt: Date | string;
  dueDate: Date | string | null | undefined;
}): SubmissionStatus {
  const { submittedAt, dueDate } = args;
  if (!dueDate) return 'submitted';
  const submittedMs =
    submittedAt instanceof Date ? submittedAt.getTime() : new Date(submittedAt).getTime();
  const dueMs = dueDate instanceof Date ? dueDate.getTime() : new Date(dueDate).getTime();
  return submittedMs > dueMs ? 'late' : 'submitted';
}

export function clampScore(score: number, maxScore: number | null | undefined): number {
  if (typeof maxScore !== 'number' || Number.isNaN(maxScore)) {
    return Math.max(0, score);
  }
  return Math.max(0, Math.min(score, maxScore));
}
