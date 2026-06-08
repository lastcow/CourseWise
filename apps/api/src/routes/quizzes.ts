import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  createQuizQuestionSchema,
  createQuizSchema,
  gradeQuizAnswerSchema,
  reorderQuizQuestionsSchema,
  saveQuizAttemptAnswersSchema,
  submitQuizAttemptSchema,
  updateQuizQuestionSchema,
  updateQuizSchema,
  type CreateQuizInput,
  type CreateQuizQuestionInput,
  type GradeQuizAnswerInput,
  type QuizAnswerSummary,
  type QuizAttemptDetail,
  type QuizAttemptSummary,
  type QuizAttemptWithStudent,
  type QuizQuestionStudentView,
  type QuizQuestionTeacherView,
  type QuizQuestionType,
  type QuizSummary,
  type ReorderQuizQuestionsInput,
  type SaveQuizAttemptAnswersInput,
  type SubmitQuizAttemptInput,
  type UpdateQuizInput,
  type UpdateQuizQuestionInput,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  finalGrades,
  modules,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import {
  requireAuth,
  requireCourseAccess,
  requireTokenCourseAccess,
} from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import {
  canWriteCourse,
  isCourseEnrolled,
  isCourseTeacher,
} from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import {
  autoGradeAnswer,
  clampPoints,
  computeAttemptExpiry,
  isAutoGradedType,
  quizAttemptIsExpired,
} from '../services/quizGrading';
import { resolveQuizScheduleForStudent } from '../services/quizSchedules';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toQuizSummary(
  row: typeof quizzes.$inferSelect,
  questionCount?: number,
  attemptCount?: number,
  pendingReviewCount?: number,
): QuizSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    groupId: row.groupId ?? null,
    setId: row.setId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    untilDate: row.untilDate ?? null,
    timeLimitMinutes: row.timeLimitMinutes ?? null,
    maxAttempts: row.maxAttempts,
    maxScore: num(row.maxScore),
    passingScore: num(row.passingScore),
    publishedAt: row.publishedAt ?? null,
    closedAt: row.closedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    questionCount,
    attemptCount,
    pendingReviewCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTeacherQuestion(row: typeof quizQuestions.$inferSelect): QuizQuestionTeacherView {
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

function toStudentQuestion(row: typeof quizQuestions.$inferSelect): QuizQuestionStudentView {
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

function toAttemptSummary(row: typeof quizAttempts.$inferSelect): QuizAttemptSummary {
  return {
    id: row.id,
    quizId: row.quizId,
    studentId: row.studentId,
    status: row.status,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt ?? null,
    submittedAt: row.submittedAt ?? null,
    score: num(row.score),
    maxScore: num(row.maxScore),
    teacherReviewed: row.teacherReviewed,
    gradedAt: row.gradedAt ?? null,
    gradedById: row.gradedById ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAnswerSummary(row: typeof quizAnswers.$inferSelect): QuizAnswerSummary {
  return {
    id: row.id,
    attemptId: row.attemptId,
    questionId: row.questionId,
    answer: row.answer ?? null,
    isCorrect: row.isCorrect ?? null,
    pointsAwarded: num(row.pointsAwarded),
    feedback: row.feedback ?? null,
    gradedById: row.gradedById ?? null,
    gradedAt: row.gradedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadQuiz(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz not found');
  return row;
}

async function loadQuestion(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db.select().from(quizQuestions).where(eq(quizQuestions.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz question not found');
  return row;
}

async function loadAttempt(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz attempt not found');
  return row;
}

async function loadAnswer(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db.select().from(quizAnswers).where(eq(quizAnswers.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz answer not found');
  return row;
}

async function ensureQuizViewable(
  c: Context<AppEnv>,
  row: typeof quizzes.$inferSelect,
): Promise<void> {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') return;
  if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, row.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return;
  }
  if (row.status === 'draft') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Quiz is not published');
  }
  if (!(await isCourseEnrolled(db, row.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
}

// =================== Quizzes ===================

r.get(
  '/courses/:courseId/quizzes',
  requireScopeGroup('quizzesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const visibleStatuses =
      auth.user.role === 'student'
        ? (['published', 'closed', 'archived'] as const)
        : (['draft', 'published', 'closed', 'archived'] as const);
    const rows = await db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.courseId, courseId),
          inArray(
            quizzes.status,
            visibleStatuses as unknown as ('draft' | 'published' | 'closed' | 'archived')[],
          ),
        ),
      )
      .orderBy(desc(quizzes.createdAt));
    const ids = rows.map((q) => q.id);
    const counts = new Map<string, number>();
    const attempts = new Map<string, number>();
    const pending = new Map<string, number>();
    if (ids.length > 0) {
      const qcounts = await db
        .select({ quizId: quizQuestions.quizId, c: sql<number>`count(*)::int` })
        .from(quizQuestions)
        .where(inArray(quizQuestions.quizId, ids))
        .groupBy(quizQuestions.quizId);
      for (const q of qcounts) counts.set(q.quizId, q.c);
      const acounts = await db
        .select({ quizId: quizAttempts.quizId, c: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .where(inArray(quizAttempts.quizId, ids))
        .groupBy(quizAttempts.quizId);
      for (const a of acounts) attempts.set(a.quizId, a.c);
      const pcounts = await db
        .select({ quizId: quizAttempts.quizId, c: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .where(
          and(
            inArray(quizAttempts.quizId, ids),
            inArray(quizAttempts.status, ['submitted', 'expired']),
            eq(quizAttempts.teacherReviewed, false),
          ),
        )
        .groupBy(quizAttempts.quizId);
      for (const p of pcounts) pending.set(p.quizId, p.c);
    }
    return success(
      c,
      rows.map((row) =>
        toQuizSummary(
          row,
          counts.get(row.id) ?? 0,
          attempts.get(row.id) ?? 0,
          pending.get(row.id) ?? 0,
        ),
      ),
    );
  },
);

r.post(
  '/courses/:courseId/quizzes',
  requireScopeGroup('quizzesWrite'),
  requireTokenCourseAccess(),
  validateJson(createQuizSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateQuizInput;
    if (input.moduleId) {
      const mod = (
        await db
          .select({ courseId: modules.courseId })
          .from(modules)
          .where(eq(modules.id, input.moduleId))
          .limit(1)
      )[0];
      if (!mod || mod.courseId !== courseId) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'moduleId must belong to this course',
        );
      }
    }
    if (input.startTime && input.endTime) {
      if (new Date(input.endTime).getTime() <= new Date(input.startTime).getTime()) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'endTime must be after startTime',
        );
      }
    }
    const [created] = await db
      .insert(quizzes)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: input.description ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        untilDate: input.untilDate ?? null,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        maxAttempts: input.maxAttempts ?? 1,
        passingScore: input.passingScore != null ? input.passingScore.toString() : null,
        status: 'draft',
        createdById: auth.user.id,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create quiz');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz.create',
      target: created.id,
      metadata: { courseId },
    });
    return success(c, toQuizSummary(created, 0), 201);
  },
);

r.get('/quizzes/:quizId', requireScopeGroup('quizzesRead'), async (c) => {
  const id = requireParam(c, 'quizId');
  const row = await loadQuiz(c, id);
  await ensureQuizViewable(c, row);
  const db = c.get('db');
  const auth = c.get('auth');
  const [{ c: count } = { c: 0 }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));
  const summary = toQuizSummary(row, count);
  // Surface the student's resolved wave so the briefing can show per-student
  // open/close times (or a "not scheduled" state) on a gated quiz.
  if (auth.user.role === 'student') {
    const resolution = await resolveQuizScheduleForStudent(db, row, auth.user.id);
    summary.hasSchedules = resolution.gated;
    if (resolution.gated) {
      summary.mySchedule = resolution.blocked
        ? {
            scheduleId: null,
            name: null,
            isRemainder: false,
            blocked: true,
            startTime: null,
            endTime: null,
            untilDate: null,
            timeLimitMinutes: null,
            maxAttempts: row.maxAttempts,
          }
        : {
            scheduleId: resolution.window.scheduleId,
            name: resolution.window.name,
            isRemainder: resolution.window.isRemainder,
            blocked: false,
            startTime: resolution.window.startTime,
            endTime: resolution.window.endTime,
            untilDate: resolution.window.untilDate,
            timeLimitMinutes: resolution.window.timeLimitMinutes,
            maxAttempts: resolution.window.maxAttempts,
          };
    }
  }
  return success(c, summary);
});

r.patch(
  '/quizzes/:quizId',
  requireScopeGroup('quizzesWrite'),
  validateJson(updateQuizSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'quizId');
    const row = await loadQuiz(c, id);
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateQuizInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.setId !== undefined) {
      patch.setId = input.setId;
      // A set supplies its own category; clear any direct group membership so
      // the quiz doesn't count both directly and via the set's roll-up.
      if (input.setId !== null) patch.groupId = null;
    }
    if (input.startTime !== undefined) patch.startTime = input.startTime;
    if (input.endTime !== undefined) patch.endTime = input.endTime;
    if (input.untilDate !== undefined) patch.untilDate = input.untilDate;
    if (input.timeLimitMinutes !== undefined) patch.timeLimitMinutes = input.timeLimitMinutes;
    if (input.maxAttempts !== undefined) patch.maxAttempts = input.maxAttempts;
    if (input.passingScore !== undefined) {
      patch.passingScore = input.passingScore === null ? null : input.passingScore.toString();
    }

    const newStart =
      input.startTime !== undefined ? input.startTime : row.startTime;
    const newEnd = input.endTime !== undefined ? input.endTime : row.endTime;
    if (newStart && newEnd && new Date(newEnd).getTime() <= new Date(newStart).getTime()) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'endTime must be after startTime',
      );
    }

    const [updated] = await db
      .update(quizzes)
      .set(patch)
      .where(eq(quizzes.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz not found');

    // Group / set membership changes the rolled-up grade contribution, so flag
    // the course's final grades stale (recomputed on the next Recalculate).
    if (patch.setId !== undefined || patch.groupId !== undefined) {
      await db
        .update(finalGrades)
        .set({ isOutdated: true, updatedAt: new Date().toISOString() })
        .where(eq(finalGrades.courseId, row.courseId));
    }
    return success(c, toQuizSummary(updated));
  },
);

r.delete('/quizzes/:quizId', requireScopeGroup('quizzesWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'quizId');
  const row = await loadQuiz(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(quizzes).where(eq(quizzes.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'quiz.delete',
    target: id,
  });
  return success(c, { id });
});

async function transitionQuiz(
  c: Context<AppEnv>,
  next: 'published' | 'closed' | 'archived',
) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'quizId');
  const row = await loadQuiz(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  if (next === 'published') {
    const [{ c: count } = { c: 0 }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));
    if (count === 0) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz must have at least one question');
    }
  }
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  if (next === 'published') patch.publishedAt = new Date().toISOString();
  if (next === 'closed') patch.closedAt = new Date().toISOString();
  if (next === 'archived') patch.archivedAt = new Date().toISOString();
  const [updated] = await db.update(quizzes).set(patch).where(eq(quizzes.id, id)).returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz not found');
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `quiz.${next}`,
    target: id,
  });
  return success(c, toQuizSummary(updated));
}

r.post('/quizzes/:quizId/publish', requireScopeGroup('quizzesWrite'), (c) =>
  transitionQuiz(c, 'published'),
);
r.post('/quizzes/:quizId/close', requireScopeGroup('quizzesWrite'), (c) =>
  transitionQuiz(c, 'closed'),
);
r.post('/quizzes/:quizId/archive', requireScopeGroup('quizzesWrite'), (c) =>
  transitionQuiz(c, 'archived'),
);

// Unarchive restores to `draft` rather than the prior status: we don't track
// what the row was before archive, and auto-re-publishing could resurrect a
// quiz whose window is now stale. Teachers republish in one click. Mirrors
// the assignment unarchive route.
r.post('/quizzes/:quizId/unarchive', requireScopeGroup('quizzesWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'quizId');
  const row = await loadQuiz(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  if (row.status !== 'archived') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz is not archived');
  }
  const [updated] = await db
    .update(quizzes)
    .set({ status: 'draft', archivedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(quizzes.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Quiz not found');
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'quiz.unarchive',
    target: id,
  });
  return success(c, toQuizSummary(updated));
});

// =================== Quiz questions ===================

r.get('/quizzes/:quizId/questions', requireScopeGroup('quizzesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'quizId');
  const quiz = await loadQuiz(c, id);
  await ensureQuizViewable(c, quiz);
  const rows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.position), asc(quizQuestions.createdAt));
  if (auth.user.role === 'student') {
    return success(c, rows.map(toStudentQuestion));
  }
  return success(c, rows.map(toTeacherQuestion));
});

function defaultOptions(
  type: QuizQuestionType,
  options: string[] | null | undefined,
): string[] | null {
  if (type === 'true_false' && (!options || options.length !== 2)) {
    return ['True', 'False'];
  }
  return options ?? null;
}

r.post(
  '/quizzes/:quizId/questions',
  requireScopeGroup('quizzesWrite'),
  validateJson(createQuizQuestionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'quizId');
    const quiz = await loadQuiz(c, id);
    if (!(await canWriteCourse(db, auth.user, quiz.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    if (quiz.status === 'archived') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz is archived');
    }
    const input = c.get('validated') as CreateQuizQuestionInput;
    const options = defaultOptions(input.type, input.options ?? null);
    const [{ position: maxPosition } = { position: -1 }] = await db
      .select({ position: sql<number>`COALESCE(MAX(${quizQuestions.position}), -1)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));
    const [created] = await db
      .insert(quizQuestions)
      .values({
        quizId: id,
        prompt: input.prompt,
        type: input.type,
        options: options as never,
        correctAnswers: (input.correctAnswers as never) ?? null,
        explanation: input.explanation ?? null,
        points: (input.points ?? 1).toString(),
        position: input.position ?? maxPosition + 1,
      })
      .returning();
    if (!created)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create question');
    // recompute quiz maxScore (sum of points).
    await refreshQuizMaxScore(db, id);
    return success(c, toTeacherQuestion(created), 201);
  },
);

async function refreshQuizMaxScore(db: Db, quizId: string) {
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${quizQuestions.points}), 0)::numeric` })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId));
  await db
    .update(quizzes)
    .set({ maxScore: total.toString() })
    .where(eq(quizzes.id, quizId));
}

r.get('/quiz-questions/:questionId', requireScopeGroup('quizzesRead'), async (c) => {
  const auth = c.get('auth');
  const id = requireParam(c, 'questionId');
  const row = await loadQuestion(c, id);
  const quiz = await loadQuiz(c, row.quizId);
  await ensureQuizViewable(c, quiz);
  if (auth.user.role === 'student') return success(c, toStudentQuestion(row));
  return success(c, toTeacherQuestion(row));
});

r.patch(
  '/quiz-questions/:questionId',
  requireScopeGroup('quizzesWrite'),
  validateJson(updateQuizQuestionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'questionId');
    const row = await loadQuestion(c, id);
    const quiz = await loadQuiz(c, row.quizId);
    if (!(await canWriteCourse(db, auth.user, quiz.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    if (quiz.status === 'archived') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz is archived');
    }
    const input = c.get('validated') as UpdateQuizQuestionInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.prompt !== undefined) patch.prompt = input.prompt;
    if (input.options !== undefined) patch.options = input.options;
    if (input.correctAnswers !== undefined) patch.correctAnswers = input.correctAnswers;
    if (input.explanation !== undefined) patch.explanation = input.explanation;
    if (input.points !== undefined) patch.points = input.points.toString();
    if (input.position !== undefined) patch.position = input.position;
    const [updated] = await db
      .update(quizQuestions)
      .set(patch)
      .where(eq(quizQuestions.id, id))
      .returning();
    if (!updated)
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Question not found');
    if (input.points !== undefined) {
      await refreshQuizMaxScore(db, row.quizId);
    }
    return success(c, toTeacherQuestion(updated));
  },
);

r.delete('/quiz-questions/:questionId', requireScopeGroup('quizzesWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'questionId');
  const row = await loadQuestion(c, id);
  const quiz = await loadQuiz(c, row.quizId);
  if (!(await canWriteCourse(db, auth.user, quiz.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(quizQuestions).where(eq(quizQuestions.id, id));
  await refreshQuizMaxScore(db, row.quizId);
  return success(c, { id });
});

r.post(
  '/quizzes/:quizId/questions/reorder',
  requireScopeGroup('quizzesWrite'),
  validateJson(reorderQuizQuestionsSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'quizId');
    const quiz = await loadQuiz(c, id);
    if (!(await canWriteCourse(db, auth.user, quiz.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as ReorderQuizQuestionsInput;
    const owned = await db
      .select({ id: quizQuestions.id })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));
    const ownedIds = new Set(owned.map((q) => q.id));
    for (const x of input.ids) {
      if (!ownedIds.has(x)) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'All ids must belong to this quiz',
        );
      }
    }
    // Single CASE update for atomicity.
    const caseExpr = sql.join(
      input.ids.map((qid, idx) => sql`WHEN ${quizQuestions.id} = ${qid} THEN ${idx}`),
      sql.raw(' '),
    );
    await db
      .update(quizQuestions)
      .set({
        position: sql`CASE ${caseExpr} ELSE ${quizQuestions.position} END`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(quizQuestions.quizId, id),
          inArray(quizQuestions.id, input.ids),
        ),
      );
    const rows = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.position), asc(quizQuestions.createdAt));
    return success(c, rows.map(toTeacherQuestion));
  },
);

// =================== Quiz attempts ===================

async function listAttemptAnswers(
  c: Context<AppEnv>,
  attemptId: string,
): Promise<QuizAnswerSummary[]> {
  const db = c.get('db');
  const rows = await db
    .select()
    .from(quizAnswers)
    .where(eq(quizAnswers.attemptId, attemptId))
    .orderBy(asc(quizAnswers.createdAt));
  return rows.map(toAnswerSummary);
}

async function loadAttemptDetail(
  c: Context<AppEnv>,
  attempt: typeof quizAttempts.$inferSelect,
): Promise<QuizAttemptDetail> {
  const auth = c.get('auth');
  const db = c.get('db');
  const quiz = await loadQuiz(c, attempt.quizId);
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, attempt.quizId))
    .orderBy(asc(quizQuestions.position), asc(quizQuestions.createdAt));
  const answers = await listAttemptAnswers(c, attempt.id);
  const pendingReviewCount = answers.filter((a) => a.pointsAwarded === null).length;
  const includeCorrect =
    auth.user.role !== 'student' || attempt.status !== 'in_progress';
  return {
    ...toAttemptSummary(attempt),
    quiz: toQuizSummary(quiz, questions.length),
    questions: includeCorrect
      ? questions.map(toTeacherQuestion)
      : questions.map(toStudentQuestion),
    answers,
    pendingReviewCount,
  };
}

r.post(
  '/quizzes/:quizId/attempts',
  requireScopeGroup('quizAttemptsWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'quizId');
    const quiz = await loadQuiz(c, id);
    if (auth.user.role !== 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only students can start attempts');
    }
    if (quiz.status !== 'published') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz is not open for attempts');
    }
    if (!(await isCourseEnrolled(db, quiz.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
    }
    const now = new Date();
    // Resolve this student's effective window. When the quiz has tester
    // schedules, access is gated: a student in no wave is blocked; otherwise
    // their wave's window (merged over the quiz defaults) governs the attempt.
    const resolution = await resolveQuizScheduleForStudent(db, quiz, auth.user.id);
    if (resolution.blocked) {
      throw new ApiException(
        403,
        ERROR_CODES.FORBIDDEN,
        'You are not scheduled for this quiz',
      );
    }
    const effective = resolution.window;
    if (effective.startTime && now.getTime() < new Date(effective.startTime).getTime()) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz has not started yet');
    }
    if (effective.endTime && now.getTime() >= new Date(effective.endTime).getTime()) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Quiz window has closed');
    }
    // resume an active attempt for this student if one exists.
    const [active] = await db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, id),
          eq(quizAttempts.studentId, auth.user.id),
          eq(quizAttempts.status, 'in_progress'),
        ),
      )
      .limit(1);
    if (active) {
      if (quizAttemptIsExpired(active.expiresAt ?? null, now)) {
        // Auto-submit (with no new answers) before returning.
        await finalizeAttempt(c, active, [], { expired: true });
        const refreshed = await loadAttempt(c, active.id);
        return success(c, await loadAttemptDetail(c, refreshed));
      }
      return success(c, await loadAttemptDetail(c, active));
    }
    // attempt count check.
    const [{ used } = { used: 0 }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.quizId, id), eq(quizAttempts.studentId, auth.user.id)),
      );
    if (used >= effective.maxAttempts) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Maximum attempts reached');
    }
    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`COALESCE(SUM(${quizQuestions.points}), 0)::numeric` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id));
    const expiry = computeAttemptExpiry({
      startedAt: now,
      timeLimitMinutes: effective.timeLimitMinutes,
      endTime: effective.endTime,
      untilDate: effective.untilDate,
    });
    const [created] = await db
      .insert(quizAttempts)
      .values({
        quizId: id,
        studentId: auth.user.id,
        status: 'in_progress',
        startedAt: now.toISOString(),
        expiresAt: expiry ? expiry.toISOString() : null,
        maxScore: total.toString(),
        scheduleId: effective.scheduleId,
      })
      .returning();
    if (!created)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to start attempt');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz_attempt.start',
      target: created.id,
      metadata: { quizId: id, scheduleId: effective.scheduleId },
    });
    return success(c, await loadAttemptDetail(c, created), 201);
  },
);

r.get('/quiz-attempts/:attemptId', requireScopeGroup('quizAttemptsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'attemptId');
  const attempt = await loadAttempt(c, id);
  const quiz = await loadQuiz(c, attempt.quizId);
  if (auth.user.role === 'student') {
    if (attempt.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot view another attempt');
    }
  } else if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, quiz.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
  }
  // Lazy expire if needed.
  if (
    attempt.status === 'in_progress' &&
    quizAttemptIsExpired(attempt.expiresAt ?? null)
  ) {
    await finalizeAttempt(c, attempt, [], { expired: true });
    const refreshed = await loadAttempt(c, attempt.id);
    return success(c, await loadAttemptDetail(c, refreshed));
  }
  return success(c, await loadAttemptDetail(c, attempt));
});

async function upsertAnswers(
  c: Context<AppEnv>,
  attempt: typeof quizAttempts.$inferSelect,
  inputs: Array<{ questionId: string; answer?: unknown }>,
  options: { autograde: boolean },
): Promise<void> {
  if (inputs.length === 0) return;
  const db = c.get('db');
  const questionIds = inputs.map((x) => x.questionId);
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(
      and(
        eq(quizQuestions.quizId, attempt.quizId),
        inArray(quizQuestions.id, questionIds),
      ),
    );
  const qMap = new Map(questions.map((q) => [q.id, q]));
  for (const { questionId, answer } of inputs) {
    const q = qMap.get(questionId);
    if (!q) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Question ${questionId} does not belong to this quiz`,
      );
    }
    const points = Number(q.points);
    const graded = options.autograde
      ? autoGradeAnswer({
          type: q.type as QuizQuestionType,
          correctAnswers: q.correctAnswers,
          studentAnswer: answer,
          points,
        })
      : { isCorrect: null as boolean | null, pointsAwarded: null as number | null, needsReview: !isAutoGradedType(q.type as QuizQuestionType) };
    await db
      .insert(quizAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        answer: (answer as never) ?? null,
        isCorrect: graded.isCorrect,
        pointsAwarded:
          graded.pointsAwarded !== null ? graded.pointsAwarded.toString() : null,
      })
      .onConflictDoUpdate({
        target: [quizAnswers.attemptId, quizAnswers.questionId],
        set: {
          answer: (answer as never) ?? null,
          isCorrect: graded.isCorrect,
          pointsAwarded:
            graded.pointsAwarded !== null ? graded.pointsAwarded.toString() : null,
          updatedAt: new Date().toISOString(),
        },
      });
  }
}

r.patch(
  '/quiz-attempts/:attemptId/answers',
  requireScopeGroup('quizAttemptsWrite'),
  validateJson(saveQuizAttemptAnswersSchema),
  async (c) => {
    const auth = c.get('auth');
    const id = requireParam(c, 'attemptId');
    const attempt = await loadAttempt(c, id);
    if (auth.user.role !== 'student' || attempt.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can save');
    }
    if (attempt.status !== 'in_progress') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Attempt is not in progress');
    }
    if (quizAttemptIsExpired(attempt.expiresAt ?? null)) {
      // Auto-submit on expiry rather than accept new answers.
      await finalizeAttempt(c, attempt, [], { expired: true });
      const refreshed = await loadAttempt(c, attempt.id);
      return success(c, await loadAttemptDetail(c, refreshed));
    }
    const input = c.get('validated') as SaveQuizAttemptAnswersInput;
    await upsertAnswers(c, attempt, input.answers, { autograde: false });
    return success(c, await loadAttemptDetail(c, attempt));
  },
);

async function finalizeAttempt(
  c: Context<AppEnv>,
  attempt: typeof quizAttempts.$inferSelect,
  newAnswers: Array<{ questionId: string; answer?: unknown }>,
  opts: { expired?: boolean } = {},
): Promise<void> {
  const db = c.get('db');
  await upsertAnswers(c, attempt, newAnswers, { autograde: true });
  // Re-grade all auto-graded answers we have for this attempt (saved during
  // PATCH /answers without grading, and the freshly upserted ones).
  const allAnswers = await db
    .select()
    .from(quizAnswers)
    .where(eq(quizAnswers.attemptId, attempt.id));
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, attempt.quizId));
  const qMap = new Map(questions.map((q) => [q.id, q]));
  let scoreSum = 0;
  let pendingReview = 0;
  for (const a of allAnswers) {
    const q = qMap.get(a.questionId);
    if (!q) continue;
    const points = Number(q.points);
    const result = autoGradeAnswer({
      type: q.type as QuizQuestionType,
      correctAnswers: q.correctAnswers,
      studentAnswer: a.answer,
      points,
    });
    if (result.pointsAwarded === null) {
      // subjective — leave as-is for teacher review.
      pendingReview += 1;
    } else {
      await db
        .update(quizAnswers)
        .set({
          isCorrect: result.isCorrect,
          pointsAwarded: result.pointsAwarded.toString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(quizAnswers.id, a.id));
      scoreSum += result.pointsAwarded;
    }
  }
  const total = Number(attempt.maxScore ?? '0');
  await db
    .update(quizAttempts)
    .set({
      status: opts.expired ? 'expired' : 'submitted',
      submittedAt: new Date().toISOString(),
      score: scoreSum.toString(),
      maxScore: total ? total.toString() : null,
      teacherReviewed: pendingReview === 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(quizAttempts.id, attempt.id));
}

r.post(
  '/quiz-attempts/:attemptId/submit',
  requireScopeGroup('quizAttemptsWrite'),
  validateJson(submitQuizAttemptSchema),
  async (c) => {
    const auth = c.get('auth');
    const id = requireParam(c, 'attemptId');
    const attempt = await loadAttempt(c, id);
    if (auth.user.role !== 'student' || attempt.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can submit');
    }
    if (attempt.status !== 'in_progress') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Attempt is not in progress');
    }
    const input = c.get('validated') as SubmitQuizAttemptInput;
    const expired = quizAttemptIsExpired(attempt.expiresAt ?? null);
    await finalizeAttempt(c, attempt, input.answers ?? [], { expired });
    const refreshed = await loadAttempt(c, id);
    await recordAudit(c.get('db'), {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: expired ? 'quiz_attempt.expire' : 'quiz_attempt.submit',
      target: id,
      metadata: { score: refreshed.score, expired },
    });
    return success(c, await loadAttemptDetail(c, refreshed));
  },
);

r.get(
  '/quizzes/:quizId/attempts',
  requireScopeGroup('quizAttemptsRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'quizId');
    const quiz = await loadQuiz(c, id);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list all attempts');
    }
    if (
      auth.user.role === 'teacher' &&
      !(await isCourseTeacher(db, quiz.courseId, auth.user.id))
    ) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    const rows = await db
      .select({
        a: quizAttempts,
        student: { id: users.id, name: users.name, email: users.email },
      })
      .from(quizAttempts)
      .innerJoin(users, eq(quizAttempts.studentId, users.id))
      .where(eq(quizAttempts.quizId, id))
      .orderBy(desc(quizAttempts.startedAt));
    const out: QuizAttemptWithStudent[] = rows.map(({ a, student }) => ({
      ...toAttemptSummary(a),
      student,
    }));
    return success(c, out);
  },
);

r.get('/me/quizzes/:quizId/attempts', requireScopeGroup('quizAttemptsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'quizId');
  const quiz = await loadQuiz(c, id);
  await ensureQuizViewable(c, quiz);
  if (auth.user.role !== 'student') {
    return success(c, [] as QuizAttemptSummary[]);
  }
  const rows = await db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.quizId, id), eq(quizAttempts.studentId, auth.user.id)),
    )
    .orderBy(desc(quizAttempts.startedAt));
  return success(c, rows.map(toAttemptSummary));
});

// =================== Grading override ===================

r.patch(
  '/quiz-answers/:answerId/grade',
  requireScopeGroup('quizGradeWrite'),
  validateJson(gradeQuizAnswerSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'answerId');
    const answer = await loadAnswer(c, id);
    const attempt = await loadAttempt(c, answer.attemptId);
    const quiz = await loadQuiz(c, attempt.quizId);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only a teacher can grade');
    }
    if (
      auth.user.role === 'teacher' &&
      !(await isCourseTeacher(db, quiz.courseId, auth.user.id))
    ) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    const input = c.get('validated') as GradeQuizAnswerInput;
    const [question] = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.id, answer.questionId))
      .limit(1);
    if (!question) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Question not found');
    }
    const max = Number(question.points);
    const clamped = clampPoints(input.pointsAwarded, max);
    const now = new Date().toISOString();
    const [updated] = await db
      .update(quizAnswers)
      .set({
        pointsAwarded: clamped.toString(),
        isCorrect: clamped >= max ? true : clamped === 0 ? false : null,
        feedback: input.feedback ?? null,
        gradedAt: now,
        gradedById: auth.user.id,
        updatedAt: now,
      })
      .where(eq(quizAnswers.id, id))
      .returning();
    if (!updated)
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Answer not found');
    // Recompute total + teacherReviewed flag.
    const answers = await db
      .select()
      .from(quizAnswers)
      .where(eq(quizAnswers.attemptId, attempt.id));
    let total = 0;
    let pending = 0;
    for (const a of answers) {
      if (a.pointsAwarded === null) pending += 1;
      else total += Number(a.pointsAwarded);
    }
    await db
      .update(quizAttempts)
      .set({
        score: total.toString(),
        teacherReviewed: pending === 0,
        gradedAt: now,
        gradedById: auth.user.id,
        updatedAt: now,
      })
      .where(eq(quizAttempts.id, attempt.id));
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz_answer.grade',
      target: id,
      metadata: { points: clamped },
    });
    return success(c, toAnswerSummary(updated));
  },
);

export default r;
