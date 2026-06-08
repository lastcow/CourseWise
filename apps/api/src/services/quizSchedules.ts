import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { quizScheduleMembers, quizSchedules, quizzes } from '../db/schema';

type QuizRow = typeof quizzes.$inferSelect;
type ScheduleRow = typeof quizSchedules.$inferSelect;

/** The quiz-window fields a wave may override. */
export type QuizWindowFields = Pick<
  QuizRow,
  'startTime' | 'endTime' | 'untilDate' | 'timeLimitMinutes' | 'maxAttempts'
>;

/** Per-student effective window after merging a wave over the quiz defaults. */
export interface EffectiveQuizWindow {
  /** null when the quiz is ungated (no schedules exist). */
  scheduleId: string | null;
  name: string | null;
  isRemainder: boolean;
  startTime: string | null;
  endTime: string | null;
  untilDate: string | null;
  timeLimitMinutes: number | null;
  /** Resolved: wave override ?? quiz value (quiz.maxAttempts is NOT NULL). */
  maxAttempts: number;
}

export type ScheduleResolution =
  | { gated: false; blocked: false; window: EffectiveQuizWindow }
  | { gated: true; blocked: true; window: null }
  | { gated: true; blocked: false; window: EffectiveQuizWindow };

/** The quiz's own window, used when the quiz has no schedules. */
export function windowFromQuiz(quiz: QuizWindowFields): EffectiveQuizWindow {
  return {
    scheduleId: null,
    name: null,
    isRemainder: false,
    startTime: quiz.startTime,
    endTime: quiz.endTime,
    untilDate: quiz.untilDate,
    timeLimitMinutes: quiz.timeLimitMinutes,
    maxAttempts: quiz.maxAttempts,
  };
}

/** Merge a wave over the quiz defaults (wave field ?? quiz field). Pure. */
export function mergeWaveWindow(
  quiz: QuizWindowFields,
  wave: ScheduleRow,
): EffectiveQuizWindow {
  return {
    scheduleId: wave.id,
    name: wave.name,
    isRemainder: wave.isRemainder,
    startTime: wave.startTime ?? quiz.startTime,
    endTime: wave.endTime ?? quiz.endTime,
    untilDate: wave.untilDate ?? quiz.untilDate,
    timeLimitMinutes: wave.timeLimitMinutes ?? quiz.timeLimitMinutes,
    maxAttempts: wave.maxAttempts ?? quiz.maxAttempts,
  };
}

/**
 * Resolve which window governs a student for a quiz.
 *  - No schedules        -> ungated, use the quiz's own window (today's behavior).
 *  - In an explicit wave  -> that wave's merged window.
 *  - No explicit wave but a remainder wave exists -> the remainder's window.
 *  - Otherwise            -> gated + blocked (enrolled but scheduled for no wave).
 */
export async function resolveQuizScheduleForStudent(
  db: Db,
  quiz: QuizRow,
  studentId: string,
): Promise<ScheduleResolution> {
  const schedules = await db
    .select()
    .from(quizSchedules)
    .where(eq(quizSchedules.quizId, quiz.id));

  if (schedules.length === 0) {
    return { gated: false, blocked: false, window: windowFromQuiz(quiz) };
  }

  const [member] = await db
    .select({ scheduleId: quizScheduleMembers.scheduleId })
    .from(quizScheduleMembers)
    .where(
      and(
        eq(quizScheduleMembers.quizId, quiz.id),
        eq(quizScheduleMembers.studentId, studentId),
      ),
    )
    .limit(1);

  const wave = member
    ? schedules.find((s) => s.id === member.scheduleId)
    : schedules.find((s) => s.isRemainder);

  if (!wave) {
    return { gated: true, blocked: true, window: null };
  }
  return { gated: true, blocked: false, window: mergeWaveWindow(quiz, wave) };
}
