import { Hono, type Context } from 'hono';
import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import {
  createQuizScheduleSchema,
  setScheduleMembersSchema,
  updateQuizScheduleSchema,
  type CreateQuizScheduleInput,
  type QuizScheduleListResponse,
  type QuizScheduleMember,
  type QuizScheduleSummary,
  type QuizScheduleWithMembers,
  type SetScheduleMembersInput,
  type UpdateQuizScheduleInput,
} from '@coursewise/shared';
import { enrollments, quizScheduleMembers, quizSchedules, quizzes, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canWriteCourse } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function toScheduleSummary(row: typeof quizSchedules.$inferSelect): QuizScheduleSummary {
  return {
    id: row.id,
    quizId: row.quizId,
    name: row.name,
    position: row.position,
    isRemainder: row.isRemainder,
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    untilDate: row.untilDate ?? null,
    timeLimitMinutes: row.timeLimitMinutes ?? null,
    maxAttempts: row.maxAttempts ?? null,
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

/** Load a schedule and assert it belongs to the quiz in the path. */
async function loadSchedule(c: Context<AppEnv>, quizId: string, scheduleId: string) {
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(quizSchedules)
    .where(eq(quizSchedules.id, scheduleId))
    .limit(1);
  if (!row || row.quizId !== quizId) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Schedule not found');
  }
  return row;
}

async function requireQuizWriteAccess(c: Context<AppEnv>, courseId: string) {
  const db = c.get('db');
  const auth = c.get('auth');
  if (!(await canWriteCourse(db, auth.user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
}

/** Enforce startTime ≤ endTime ≤ untilDate over the merged wave values. */
function assertWindowOrder(
  start: string | null,
  end: string | null,
  until: string | null,
): void {
  const s = start ? Date.parse(start) : null;
  const e = end ? Date.parse(end) : null;
  const u = until ? Date.parse(until) : null;
  const bad =
    (s !== null && e !== null && s > e) ||
    (e !== null && u !== null && e > u) ||
    (s !== null && u !== null && s > u);
  if (bad) {
    throw new ApiException(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Dates must satisfy startTime ≤ endTime ≤ untilDate',
    );
  }
}

// =================== List schedules + members + remainder preview ===================

r.get('/quizzes/:quizId/schedules', requireScopeGroup('quizzesRead'), async (c) => {
  const db = c.get('db');
  const quizId = requireParam(c, 'quizId');
  const quiz = await loadQuiz(c, quizId);
  await requireQuizWriteAccess(c, quiz.courseId);

  const scheduleRows = await db
    .select()
    .from(quizSchedules)
    .where(eq(quizSchedules.quizId, quizId))
    .orderBy(asc(quizSchedules.position), asc(quizSchedules.createdAt));

  const memberRows = await db
    .select({
      scheduleId: quizScheduleMembers.scheduleId,
      studentId: quizScheduleMembers.studentId,
      name: users.name,
      email: users.email,
    })
    .from(quizScheduleMembers)
    .innerJoin(users, eq(users.id, quizScheduleMembers.studentId))
    .where(eq(quizScheduleMembers.quizId, quizId))
    .orderBy(asc(users.name));

  const membersBySchedule = new Map<string, QuizScheduleMember[]>();
  for (const m of memberRows) {
    const list = membersBySchedule.get(m.scheduleId) ?? [];
    list.push({ studentId: m.studentId, name: m.name, email: m.email });
    membersBySchedule.set(m.scheduleId, list);
  }

  // Enrolled students not in any explicit wave — absorbed by the remainder wave
  // if one exists, otherwise blocked from the quiz.
  const previewRows = await db.execute(sql`
    SELECT u.id AS "studentId"
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    WHERE e.course_id = ${quiz.courseId}
      AND e.status = 'enrolled'
      AND NOT EXISTS (
        SELECT 1 FROM quiz_schedule_members m
        WHERE m.quiz_id = ${quizId}
          AND m.student_id = e.student_id
      )
    ORDER BY u.name
  `);
  const studentIds = (previewRows.rows as Array<{ studentId: string }>).map((x) => x.studentId);

  const schedules: QuizScheduleWithMembers[] = scheduleRows.map((s) => ({
    ...toScheduleSummary(s),
    members: membersBySchedule.get(s.id) ?? [],
  }));

  const out: QuizScheduleListResponse = {
    schedules,
    remainderPreview: { count: studentIds.length, studentIds },
  };
  return success(c, out);
});

// =================== Create schedule ===================

r.post(
  '/quizzes/:quizId/schedules',
  requireScopeGroup('quizzesWrite'),
  validateJson(createQuizScheduleSchema),
  async (c) => {
    const db = c.get('db');
    const auth = c.get('auth');
    const quizId = requireParam(c, 'quizId');
    const quiz = await loadQuiz(c, quizId);
    await requireQuizWriteAccess(c, quiz.courseId);
    const input = c.get('validated') as CreateQuizScheduleInput;

    if (input.isRemainder) {
      const [existing] = await db
        .select({ id: quizSchedules.id })
        .from(quizSchedules)
        .where(and(eq(quizSchedules.quizId, quizId), eq(quizSchedules.isRemainder, true)))
        .limit(1);
      if (existing) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'This quiz already has a remainder wave',
        );
      }
    }

    const [{ count = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizSchedules)
      .where(eq(quizSchedules.quizId, quizId));

    const [created] = await db
      .insert(quizSchedules)
      .values({
        quizId,
        name: input.name,
        position: input.position ?? count,
        isRemainder: input.isRemainder ?? false,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        untilDate: input.untilDate ?? null,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        maxAttempts: input.maxAttempts ?? null,
        createdById: auth.user.id,
      })
      .returning();
    if (!created) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create schedule');
    }
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz_schedule.create',
      target: created.id,
      metadata: { quizId, isRemainder: created.isRemainder },
    });
    return success(c, toScheduleSummary(created), 201);
  },
);

// =================== Update schedule ===================

r.patch(
  '/quizzes/:quizId/schedules/:scheduleId',
  requireScopeGroup('quizzesWrite'),
  validateJson(updateQuizScheduleSchema),
  async (c) => {
    const db = c.get('db');
    const auth = c.get('auth');
    const quizId = requireParam(c, 'quizId');
    const scheduleId = requireParam(c, 'scheduleId');
    const quiz = await loadQuiz(c, quizId);
    await requireQuizWriteAccess(c, quiz.courseId);
    const schedule = await loadSchedule(c, quizId, scheduleId);
    const input = c.get('validated') as UpdateQuizScheduleInput;

    const nextStart = input.startTime !== undefined ? input.startTime : schedule.startTime;
    const nextEnd = input.endTime !== undefined ? input.endTime : schedule.endTime;
    const nextUntil = input.untilDate !== undefined ? input.untilDate : schedule.untilDate;
    assertWindowOrder(nextStart, nextEnd, nextUntil);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.position !== undefined) patch.position = input.position;
    if (input.startTime !== undefined) patch.startTime = input.startTime;
    if (input.endTime !== undefined) patch.endTime = input.endTime;
    if (input.untilDate !== undefined) patch.untilDate = input.untilDate;
    if (input.timeLimitMinutes !== undefined) patch.timeLimitMinutes = input.timeLimitMinutes;
    if (input.maxAttempts !== undefined) patch.maxAttempts = input.maxAttempts;

    const [updated] = await db
      .update(quizSchedules)
      .set(patch)
      .where(eq(quizSchedules.id, scheduleId))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Schedule not found');

    // If the open window moved, re-arm the wave-open notification for its members.
    const windowChanged =
      input.startTime !== undefined ||
      input.endTime !== undefined ||
      input.untilDate !== undefined;
    if (windowChanged) {
      await db
        .update(quizScheduleMembers)
        .set({ notifiedAt: null, updatedAt: new Date().toISOString() })
        .where(eq(quizScheduleMembers.scheduleId, scheduleId));
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz_schedule.update',
      target: scheduleId,
      metadata: { quizId, windowChanged },
    });
    return success(c, toScheduleSummary(updated));
  },
);

// =================== Delete schedule ===================

r.delete('/quizzes/:quizId/schedules/:scheduleId', requireScopeGroup('quizzesWrite'), async (c) => {
  const db = c.get('db');
  const auth = c.get('auth');
  const quizId = requireParam(c, 'quizId');
  const scheduleId = requireParam(c, 'scheduleId');
  const quiz = await loadQuiz(c, quizId);
  await requireQuizWriteAccess(c, quiz.courseId);
  await loadSchedule(c, quizId, scheduleId);

  await db.delete(quizSchedules).where(eq(quizSchedules.id, scheduleId));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'quiz_schedule.delete',
    target: scheduleId,
    metadata: { quizId },
  });
  return success(c, { id: scheduleId });
});

// =================== Set a wave's member list (batch, mutually exclusive) ===================

r.put(
  '/quizzes/:quizId/schedules/:scheduleId/members',
  requireScopeGroup('quizzesWrite'),
  validateJson(setScheduleMembersSchema),
  async (c) => {
    const db = c.get('db');
    const auth = c.get('auth');
    const quizId = requireParam(c, 'quizId');
    const scheduleId = requireParam(c, 'scheduleId');
    const quiz = await loadQuiz(c, quizId);
    await requireQuizWriteAccess(c, quiz.courseId);
    await loadSchedule(c, quizId, scheduleId);
    const input = c.get('validated') as SetScheduleMembersInput;
    const studentIds = [...new Set(input.studentIds)];

    // Every target must be an enrolled student of this course.
    if (studentIds.length > 0) {
      const enrolled = await db
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, quiz.courseId),
            eq(enrollments.status, 'enrolled'),
            inArray(enrollments.studentId, studentIds),
          ),
        );
      if (enrolled.length !== studentIds.length) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'All members must be enrolled students of this course',
        );
      }
    }

    const before = await db
      .select({ studentId: quizScheduleMembers.studentId })
      .from(quizScheduleMembers)
      .where(eq(quizScheduleMembers.scheduleId, scheduleId));
    const beforeSet = new Set(before.map((m) => m.studentId));

    // Move targets out of any OTHER wave of this quiz (mutual exclusivity).
    if (studentIds.length > 0) {
      await db
        .delete(quizScheduleMembers)
        .where(
          and(
            eq(quizScheduleMembers.quizId, quizId),
            ne(quizScheduleMembers.scheduleId, scheduleId),
            inArray(quizScheduleMembers.studentId, studentIds),
          ),
        );
    }

    // Remove members dropped from this wave.
    if (studentIds.length > 0) {
      await db
        .delete(quizScheduleMembers)
        .where(
          and(
            eq(quizScheduleMembers.scheduleId, scheduleId),
            notInArray(quizScheduleMembers.studentId, studentIds),
          ),
        );
    } else {
      await db.delete(quizScheduleMembers).where(eq(quizScheduleMembers.scheduleId, scheduleId));
    }

    // Upsert the desired members; moving a student re-arms their notification.
    if (studentIds.length > 0) {
      await db
        .insert(quizScheduleMembers)
        .values(studentIds.map((studentId) => ({ scheduleId, quizId, studentId })))
        .onConflictDoUpdate({
          target: [quizScheduleMembers.quizId, quizScheduleMembers.studentId],
          set: { scheduleId, notifiedAt: null, updatedAt: new Date().toISOString() },
        });
    }

    const added = studentIds.filter((id) => !beforeSet.has(id)).length;
    const removed = before.filter((m) => !studentIds.includes(m.studentId)).length;
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'quiz_schedule.set_members',
      target: scheduleId,
      metadata: { quizId, total: studentIds.length, added, removed },
    });

    const schedule = await loadSchedule(c, quizId, scheduleId);
    const memberRows = await db
      .select({ studentId: quizScheduleMembers.studentId, name: users.name, email: users.email })
      .from(quizScheduleMembers)
      .innerJoin(users, eq(users.id, quizScheduleMembers.studentId))
      .where(eq(quizScheduleMembers.scheduleId, scheduleId))
      .orderBy(asc(users.name));
    const out: QuizScheduleWithMembers = {
      ...toScheduleSummary(schedule),
      members: memberRows.map((m) => ({ studentId: m.studentId, name: m.name, email: m.email })),
    };
    return success(c, out);
  },
);

export default r;
