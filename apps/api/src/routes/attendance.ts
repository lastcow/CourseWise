import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  bulkMarkAttendanceSchema,
  createAttendanceSessionSchema,
  updateAttendanceSessionSchema,
  type AttendanceRecordRow,
  type AttendanceSessionSummary,
  type BulkMarkAttendanceInput,
  type CreateAttendanceSessionInput,
  type StudentAttendanceRow,
  type TodayAttendanceSession,
  type UpdateAttendanceSessionInput,
} from '@coursewise/shared';
import {
  attendanceRecords,
  attendanceSessions,
  enrollments,
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
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function toSessionSummary(
  row: typeof attendanceSessions.$inferSelect,
  recordCount?: number,
): AttendanceSessionSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description ?? null,
    sessionDate: row.sessionDate,
    status: row.status,
    closedAt: row.closedAt ?? null,
    recordCount,
    lateAfterMinutes: row.lateAfterMinutes ?? null,
    absentAfterMinutes: row.absentAfterMinutes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function computeWindow(
  row: typeof attendanceSessions.$inferSelect,
  now: Date = new Date(),
): {
  windowState: 'open' | 'late' | 'closed';
  minutesSinceStart: number;
  status: 'present' | 'late';
} {
  const startMs = new Date(row.sessionDate).getTime();
  const minutes = Math.max(0, Math.floor((now.getTime() - startMs) / 60_000));
  if (row.absentAfterMinutes != null && minutes >= row.absentAfterMinutes) {
    return { windowState: 'closed', minutesSinceStart: minutes, status: 'late' };
  }
  if (row.lateAfterMinutes != null && minutes >= row.lateAfterMinutes) {
    return { windowState: 'late', minutesSinceStart: minutes, status: 'late' };
  }
  return { windowState: 'open', minutesSinceStart: minutes, status: 'present' };
}

async function loadSession(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.id, id))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Attendance session not found');
  return row;
}

// =================== Sessions ===================

r.get(
  '/courses/:courseId/attendance-sessions',
  requireScopeGroup('attendanceRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const rows = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseId))
      .orderBy(asc(attendanceSessions.sessionDate));
    const ids = rows.map((s) => s.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const recs = await db
        .select({ sessionId: attendanceRecords.sessionId, c: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.sessionId, ids))
        .groupBy(attendanceRecords.sessionId);
      for (const r of recs) counts.set(r.sessionId, r.c);
    }
    return success(c, rows.map((row) => toSessionSummary(row, counts.get(row.id) ?? 0)));
  },
);

r.post(
  '/courses/:courseId/attendance-sessions',
  requireScopeGroup('attendanceWrite'),
  requireTokenCourseAccess(),
  validateJson(createAttendanceSessionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAttendanceSessionInput;
    const [created] = await db
      .insert(attendanceSessions)
      .values({
        courseId,
        title: input.title,
        description: input.description ?? null,
        sessionDate: input.sessionDate,
        status: 'open',
        createdById: auth.user.id,
        lateAfterMinutes: input.lateAfterMinutes ?? null,
        absentAfterMinutes: input.absentAfterMinutes ?? null,
      })
      .returning();
    if (!created)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create session');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'attendance_session.create',
      target: created.id,
      metadata: { courseId },
    });
    return success(c, toSessionSummary(created, 0), 201);
  },
);

r.get(
  '/attendance-sessions/:sessionId',
  requireScopeGroup('attendanceRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (auth.user.role === 'teacher') {
      if (!(await isCourseTeacher(db, session.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
      }
    } else if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, session.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
    }
    const [{ c: count } = { c: 0 }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, id));
    return success(c, toSessionSummary(session, count));
  },
);

r.patch(
  '/attendance-sessions/:sessionId',
  requireScopeGroup('attendanceWrite'),
  validateJson(updateAttendanceSessionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (!(await canWriteCourse(db, auth.user, session.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateAttendanceSessionInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.sessionDate !== undefined) patch.sessionDate = input.sessionDate;
    if (input.lateAfterMinutes !== undefined) patch.lateAfterMinutes = input.lateAfterMinutes;
    if (input.absentAfterMinutes !== undefined)
      patch.absentAfterMinutes = input.absentAfterMinutes;
    const [updated] = await db
      .update(attendanceSessions)
      .set(patch)
      .where(eq(attendanceSessions.id, id))
      .returning();
    if (!updated)
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Session not found');
    return success(c, toSessionSummary(updated));
  },
);

r.post(
  '/attendance-sessions/:sessionId/close',
  requireScopeGroup('attendanceWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (!(await canWriteCourse(db, auth.user, session.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(attendanceSessions)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(attendanceSessions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Session not found');
    return success(c, toSessionSummary(updated));
  },
);

r.delete(
  '/attendance-sessions/:sessionId',
  requireScopeGroup('attendanceWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (!(await canWriteCourse(db, auth.user, session.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    await db.delete(attendanceSessions).where(eq(attendanceSessions.id, id));
    return success(c, { id });
  },
);

// =================== Records ===================

r.get(
  '/attendance-sessions/:sessionId/records',
  requireScopeGroup('attendanceRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, session.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
      // Students only see their own row.
      const rows = await db
        .select({
          r: attendanceRecords,
          student: { id: users.id, name: users.name, email: users.email },
        })
        .from(attendanceRecords)
        .innerJoin(users, eq(attendanceRecords.studentId, users.id))
        .where(
          and(
            eq(attendanceRecords.sessionId, id),
            eq(attendanceRecords.studentId, auth.user.id),
          ),
        );
      // Intentionally omitting r.ipAddress — captured for our self-sign audit
      // trail but not surfaced via the API (FERPA roadmap item #7).
      const out: AttendanceRecordRow[] = rows.map(({ r, student }) => ({
        id: r.id,
        sessionId: r.sessionId,
        studentId: r.studentId,
        studentName: student.name,
        studentEmail: student.email,
        status: r.status,
        notes: r.notes ?? null,
        recordedById: r.recordedById ?? null,
        recordedAt: r.recordedAt,
        updatedAt: r.updatedAt,
      }));
      return success(c, out);
    }
    if (auth.user.role === 'teacher') {
      if (!(await isCourseTeacher(db, session.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
      }
    }
    const rows = await db
      .select({
        r: attendanceRecords,
        student: { id: users.id, name: users.name, email: users.email },
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.studentId, users.id))
      .where(eq(attendanceRecords.sessionId, id))
      .orderBy(asc(users.name));
    // See note above re: not surfacing r.ipAddress to teacher-facing rows.
    const out: AttendanceRecordRow[] = rows.map(({ r, student }) => ({
      id: r.id,
      sessionId: r.sessionId,
      studentId: r.studentId,
      studentName: student.name,
      studentEmail: student.email,
      status: r.status,
      notes: r.notes ?? null,
      recordedById: r.recordedById ?? null,
      recordedAt: r.recordedAt,
      updatedAt: r.updatedAt,
    }));
    return success(c, out);
  },
);

r.post(
  '/attendance-sessions/:sessionId/records',
  requireScopeGroup('attendanceWrite'),
  validateJson(bulkMarkAttendanceSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    const session = await loadSession(c, id);
    if (!(await canWriteCourse(db, auth.user, session.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    // Closing a session freezes student self-sign (enforced separately
    // below) — it does NOT freeze teacher corrections. Teachers must be
    // able to fix a misclick or excuse a late arrival after the fact.
    const input = c.get('validated') as BulkMarkAttendanceInput;
    const studentIds = input.records.map((r) => r.studentId);
    const enrolled = await db
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, session.courseId),
          inArray(enrollments.studentId, studentIds),
          eq(enrollments.status, 'enrolled'),
        ),
      );
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    for (const rec of input.records) {
      if (!enrolledSet.has(rec.studentId)) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'All studentIds must be enrolled in this course',
        );
      }
    }
    const now = new Date().toISOString();
    for (const rec of input.records) {
      await db
        .insert(attendanceRecords)
        .values({
          sessionId: id,
          studentId: rec.studentId,
          status: rec.status,
          notes: rec.notes ?? null,
          recordedById: auth.user.id,
          recordedAt: now,
        })
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.studentId],
          set: {
            status: rec.status,
            notes: rec.notes ?? null,
            recordedById: auth.user.id,
            recordedAt: now,
            updatedAt: now,
          },
        });
    }
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'attendance.bulk_mark',
      target: id,
      metadata: { count: input.records.length },
    });
    const rows = await db
      .select({
        r: attendanceRecords,
        student: { id: users.id, name: users.name, email: users.email },
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.studentId, users.id))
      .where(eq(attendanceRecords.sessionId, id))
      .orderBy(asc(users.name));
    // See note above re: not surfacing r.ipAddress to teacher-facing rows.
    const out: AttendanceRecordRow[] = rows.map(({ r, student }) => ({
      id: r.id,
      sessionId: r.sessionId,
      studentId: r.studentId,
      studentName: student.name,
      studentEmail: student.email,
      status: r.status,
      notes: r.notes ?? null,
      recordedById: r.recordedById ?? null,
      recordedAt: r.recordedAt,
      updatedAt: r.updatedAt,
    }));
    return success(c, out);
  },
);

// =================== Student own attendance ===================

r.get(
  '/me/courses/:courseId/attendance',
  requireScopeGroup('attendanceRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
    } else if (auth.user.role === 'teacher') {
      if (!(await isCourseTeacher(db, courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
      }
    }
    const studentId = auth.user.role === 'student' ? auth.user.id : c.req.query('studentId');
    if (!studentId) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'studentId required');
    }
    const sessions = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseId))
      .orderBy(asc(attendanceSessions.sessionDate));
    const sessionIds = sessions.map((s) => s.id);
    const recsMap = new Map<string, typeof attendanceRecords.$inferSelect>();
    if (sessionIds.length > 0) {
      const recs = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            inArray(attendanceRecords.sessionId, sessionIds),
            eq(attendanceRecords.studentId, studentId),
          ),
        );
      for (const r of recs) recsMap.set(r.sessionId, r);
    }
    const out: StudentAttendanceRow[] = sessions.map((s) => {
      const rec = recsMap.get(s.id);
      return {
        sessionId: s.id,
        sessionTitle: s.title,
        sessionDate: s.sessionDate,
        status: rec?.status ?? null,
        notes: rec?.notes ?? null,
      };
    });
    return success(c, out);
  },
);

// =================== Student self-sign ===================

function readRequestIp(c: Context<AppEnv>): string | null {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    null
  );
}

r.get(
  '/me/courses/:courseId/attendance-sessions/today',
  requireScopeGroup('attendanceRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role !== 'student') {
      return success(c, null);
    }
    if (!(await isCourseEnrolled(db, courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
    }
    const [row] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.courseId, courseId),
          eq(attendanceSessions.status, 'open'),
          sql`date_trunc('day', ${attendanceSessions.sessionDate} AT TIME ZONE 'UTC') = date_trunc('day', now() AT TIME ZONE 'UTC')`,
        ),
      )
      .orderBy(desc(attendanceSessions.sessionDate))
      .limit(1);
    if (!row) return success(c, null);
    const [existing] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionId, row.id),
          eq(attendanceRecords.studentId, auth.user.id),
        ),
      )
      .limit(1);
    const win = computeWindow(row);
    const out: TodayAttendanceSession = {
      session: toSessionSummary(row),
      alreadySigned: !!existing,
      windowState: win.windowState,
      minutesSinceStart: win.minutesSinceStart,
    };
    return success(c, out);
  },
);

r.post(
  '/me/attendance-sessions/:sessionId/sign',
  requireScopeGroup('attendanceWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'sessionId');
    if (auth.user.role !== 'student') {
      throw new ApiException(
        403,
        ERROR_CODES.FORBIDDEN,
        'Only students can self-sign attendance',
      );
    }
    const session = await loadSession(c, id);
    if (session.status === 'closed') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Session is closed');
    }
    if (!(await isCourseEnrolled(db, session.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
    }
    // Reject self-sign for sessions not scheduled today (UTC) — guards against
    // students replaying yesterday's open session if a teacher forgot to close it.
    const [{ ok } = { ok: false }] = await db
      .select({
        ok: sql<boolean>`date_trunc('day', ${attendanceSessions.sessionDate} AT TIME ZONE 'UTC') = date_trunc('day', now() AT TIME ZONE 'UTC')`,
      })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, id))
      .limit(1);
    if (!ok) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'This session is not scheduled for today',
      );
    }
    const win = computeWindow(session);
    if (win.windowState === 'closed') {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'The self-sign window for this session has closed',
      );
    }
    const recordedStatus = win.status; // 'present' or 'late' based on thresholds
    const now = new Date().toISOString();
    const ip = readRequestIp(c);
    const [rec] = await db
      .insert(attendanceRecords)
      .values({
        sessionId: id,
        studentId: auth.user.id,
        status: recordedStatus,
        recordedById: auth.user.id,
        recordedAt: now,
        ipAddress: ip,
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        // Self-sign never downgrades an existing teacher mark; we only fill in
        // the IP if a row already exists from the student's own earlier sign.
        set: {
          ipAddress: sql`coalesce(${attendanceRecords.ipAddress}, ${ip ?? null})`,
          updatedAt: now,
        },
      })
      .returning();
    if (!rec)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to record attendance');
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      action: 'attendance.self_sign',
      target: id,
      metadata: { sessionId: id, ip, status: recordedStatus, minutesLate: win.minutesSinceStart },
    });
    return success(c, { ok: true, ipAddress: ip, status: recordedStatus });
  },
);

// =================== CSV export ===================

function csvEscape(value: string): string {
  if (value === '') return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

r.get(
  '/courses/:courseId/attendance/export.csv',
  requireScopeGroup('attendanceRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot export attendance');
    }
    const sessions = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseId))
      .orderBy(asc(attendanceSessions.sessionDate));
    const sessionIds = sessions.map((s) => s.id);
    const enrolledStudents = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(
        and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')),
      )
      .orderBy(asc(users.name));
    const recordsBySession = new Map<
      string,
      Map<string, typeof attendanceRecords.$inferSelect>
    >();
    if (sessionIds.length > 0) {
      const recs = await db
        .select()
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.sessionId, sessionIds));
      for (const r of recs) {
        const inner = recordsBySession.get(r.sessionId) ?? new Map();
        inner.set(r.studentId, r);
        recordsBySession.set(r.sessionId, inner);
      }
    }
    const header = ['Student', 'Email', ...sessions.map((s) => s.title)];
    const lines = [header.map(csvEscape).join(',')];
    for (const s of enrolledStudents) {
      const cells = [s.name, s.email];
      for (const sess of sessions) {
        const rec = recordsBySession.get(sess.id)?.get(s.id);
        cells.push(rec?.status ?? '');
      }
      lines.push(cells.map(csvEscape).join(','));
    }
    const body = lines.join('\n');

    // FERPA §99.32(a): attendance export discloses every enrolled student's
    // attendance record. One audit row per student.
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'attendance.export.csv',
      target: courseId,
      metadata: { studentCount: enrolledStudents.length, sessionCount: sessions.length },
      disclosedStudentIds: enrolledStudents.map((s) => s.id),
    });

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="attendance-${courseId}.csv"`,
      },
    });
  },
);

export default r;
