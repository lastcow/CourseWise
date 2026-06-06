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

/**
 * Late-penalty percentage for a submission, per the "per started period" model:
 * each started `periodHours` window past the deadline costs `perPeriodPercent`,
 * capped at `maxPercent`. Returns 0 when there's no deadline, the submission is
 * on time, or the policy is incomplete — i.e. "no deduction".
 *
 *   periods = ceil((submittedAt - deadline) / periodHours)
 *   penalty = min(maxPercent, periods * perPeriodPercent)
 */
export function computeLatePenaltyPercent(args: {
  submittedAt: Date | string | null | undefined;
  deadline: Date | string | null | undefined;
  perPeriodPercent: number | null | undefined;
  periodHours: number | null | undefined;
  maxPercent: number | null | undefined;
}): number {
  const { submittedAt, deadline, perPeriodPercent, periodHours, maxPercent } = args;
  if (submittedAt == null || deadline == null) return 0;
  if (perPeriodPercent == null || periodHours == null || perPeriodPercent <= 0 || periodHours <= 0) {
    return 0;
  }
  const submittedMs =
    submittedAt instanceof Date ? submittedAt.getTime() : new Date(submittedAt).getTime();
  const deadlineMs = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  const lateMs = submittedMs - deadlineMs;
  if (lateMs <= 0) return 0;
  const periods = Math.ceil(lateMs / (periodHours * 3_600_000));
  const raw = periods * perPeriodPercent;
  const cap = maxPercent == null ? raw : Math.min(raw, maxPercent);
  return Math.max(0, cap);
}

/** Apply a penalty percentage to a score (caller clamps to the max). */
export function applyLatePenalty(rawScore: number, penaltyPercent: number): number {
  if (penaltyPercent <= 0) return rawScore;
  return rawScore * (1 - penaltyPercent / 100);
}

export function clampScore(score: number, maxScore: number | null | undefined): number {
  if (typeof maxScore !== 'number' || Number.isNaN(maxScore)) {
    return Math.max(0, score);
  }
  return Math.max(0, Math.min(score, maxScore));
}
