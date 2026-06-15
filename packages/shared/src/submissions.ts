// Pure late-penalty math shared by the API (authoritative grading) and the web
// client (live previews / student-facing estimates), so the number a student
// is shown never drifts from the deduction the server actually applies.

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
  submittedAt: Date | string | number | null | undefined;
  deadline: Date | string | number | null | undefined;
  perPeriodPercent: number | null | undefined;
  periodHours: number | null | undefined;
  maxPercent: number | null | undefined;
}): number {
  const { submittedAt, deadline, perPeriodPercent, periodHours, maxPercent } = args;
  if (submittedAt == null || deadline == null) return 0;
  if (
    perPeriodPercent == null ||
    periodHours == null ||
    perPeriodPercent <= 0 ||
    periodHours <= 0
  ) {
    return 0;
  }
  const submittedMs = toMs(submittedAt);
  const deadlineMs = toMs(deadline);
  const lateMs = submittedMs - deadlineMs;
  if (lateMs <= 0) return 0;
  const periods = Math.ceil(lateMs / (periodHours * 3_600_000));
  const raw = periods * perPeriodPercent;
  const capped = maxPercent == null ? raw : Math.min(raw, maxPercent);
  return Math.max(0, capped);
}

/** Apply a penalty percentage to a score (caller clamps to the max). */
export function applyLatePenalty(rawScore: number, penaltyPercent: number): number {
  if (penaltyPercent <= 0) return rawScore;
  return rawScore * (1 - penaltyPercent / 100);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a course currently rejects student submissions because it has ended.
 * Shared by the API (authoritative enforcement) and the web client (proactive
 * banners / disabled controls) so what a student sees matches what the server
 * does.
 *
 * The end date is stored at midnight UTC of the last day, so the course stays
 * open through that whole day — the lock engages at the start of the day after
 * `endDate`. Returns false when the opt-in is off or no end date is set.
 */
export function courseSubmissionsClosed(
  course: { endDate: string | null; disableSubmissionsAfterEnd: boolean },
  now: Date | number = Date.now(),
): boolean {
  if (!course.disableSubmissionsAfterEnd || !course.endDate) return false;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return nowMs >= new Date(course.endDate).getTime() + ONE_DAY_MS;
}

function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return new Date(v).getTime();
}
