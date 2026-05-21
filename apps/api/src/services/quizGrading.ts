import { QUIZ_AUTO_GRADED_TYPES, type QuizQuestionType } from '@coursewise/shared';

export function isAutoGradedType(t: QuizQuestionType): boolean {
  return (QUIZ_AUTO_GRADED_TYPES as readonly QuizQuestionType[]).includes(t);
}

function normalizeBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 't' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === 'f' || s === '0' || s === 'no') return false;
  }
  if (typeof v === 'number') return v !== 0;
  return null;
}

function toIndexSet(v: unknown): Set<number> | null {
  if (Array.isArray(v)) {
    const out = new Set<number>();
    for (const item of v) {
      if (typeof item === 'number' && Number.isInteger(item) && item >= 0) {
        out.add(item);
      } else if (typeof item === 'string' && /^-?\d+$/.test(item.trim())) {
        const n = Number.parseInt(item.trim(), 10);
        if (n >= 0) out.add(n);
      }
    }
    return out;
  }
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
    return new Set([v]);
  }
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    const n = Number.parseInt(v.trim(), 10);
    return new Set(n >= 0 ? [n] : []);
  }
  return null;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export interface AutoGradeResult {
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  needsReview: boolean;
}

export function autoGradeAnswer(args: {
  type: QuizQuestionType;
  correctAnswers: unknown;
  studentAnswer: unknown;
  points: number;
}): AutoGradeResult {
  const { type, correctAnswers, studentAnswer, points } = args;
  if (!isAutoGradedType(type)) {
    return { isCorrect: null, pointsAwarded: null, needsReview: true };
  }
  if (type === 'true_false') {
    const expected = normalizeBool(correctAnswers);
    const got = normalizeBool(studentAnswer);
    if (expected === null) {
      return { isCorrect: null, pointsAwarded: null, needsReview: true };
    }
    if (got === null) {
      return { isCorrect: false, pointsAwarded: 0, needsReview: false };
    }
    const ok = expected === got;
    return { isCorrect: ok, pointsAwarded: ok ? points : 0, needsReview: false };
  }
  // single_choice / multiple_choice — correctAnswers is an array (or single) of
  // option indexes; the student answer must match exactly (no partial credit).
  const expected = toIndexSet(correctAnswers);
  const got = toIndexSet(studentAnswer);
  if (!expected || expected.size === 0) {
    return { isCorrect: null, pointsAwarded: null, needsReview: true };
  }
  if (!got) {
    return { isCorrect: false, pointsAwarded: 0, needsReview: false };
  }
  if (type === 'single_choice' && got.size > 1) {
    return { isCorrect: false, pointsAwarded: 0, needsReview: false };
  }
  const ok = setsEqual(expected, got);
  return { isCorrect: ok, pointsAwarded: ok ? points : 0, needsReview: false };
}

export function clampPoints(points: number, max: number): number {
  return Math.max(0, Math.min(points, max));
}

export function quizAttemptIsExpired(
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function computeAttemptExpiry(args: {
  startedAt: Date;
  timeLimitMinutes: number | null | undefined;
  endTime: string | null | undefined;
  // Absolute submit-by deadline. When set the attempt's effective expiry
  // is min(startedAt + timeLimit, endTime, untilDate) — whichever comes
  // first. Matches the "for quiz, if the time left is after until date,
  // take which one come first" rule.
  untilDate?: string | null | undefined;
}): Date | null {
  const limits: number[] = [];
  if (args.timeLimitMinutes && args.timeLimitMinutes > 0) {
    limits.push(args.startedAt.getTime() + args.timeLimitMinutes * 60_000);
  }
  if (args.endTime) {
    limits.push(new Date(args.endTime).getTime());
  }
  if (args.untilDate) {
    limits.push(new Date(args.untilDate).getTime());
  }
  if (limits.length === 0) return null;
  return new Date(Math.min(...limits));
}
