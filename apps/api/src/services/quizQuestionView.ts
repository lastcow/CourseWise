import type { QuizQuestionType, QuizQuestionStudentView, QuizQuestionTeacherView } from '@coursewise/shared';
import type { quizQuestions } from '../db/schema';

type QuizQuestionRow = typeof quizQuestions.$inferSelect;

/** Full view (teacher/admin only): correct answers + explanation. */
export function toTeacherQuestion(row: QuizQuestionRow): QuizQuestionTeacherView {
  return {
    id: row.id,
    quizId: row.quizId,
    position: row.position,
    prompt: row.prompt,
    type: row.type as QuizQuestionType,
    options: Array.isArray(row.options) ? (row.options as string[]) : null,
    correctAnswers: row.correctAnswers ?? null,
    explanation: row.explanation ?? null,
    points: Number(row.points),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Live view while taking a quiz: no correct answers, no explanation. */
export function toStudentQuestion(row: QuizQuestionRow): QuizQuestionStudentView {
  return {
    id: row.id,
    quizId: row.quizId,
    position: row.position,
    prompt: row.prompt,
    type: row.type as QuizQuestionType,
    options: Array.isArray(row.options) ? (row.options as string[]) : null,
    points: Number(row.points),
  };
}

/**
 * Post-submission student review: reveal the correct answers (so a student can
 * see what they got wrong) but NEVER the teacher's explanation / marking guide.
 * The explanation is a teacher-only authoring aid and must not leak to students.
 */
export function toReviewQuestion(row: QuizQuestionRow): QuizQuestionTeacherView {
  return { ...toTeacherQuestion(row), explanation: null };
}
