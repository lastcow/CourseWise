import { Hono, type Context } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import {
  DEFAULT_GRADING_POLICY,
  createCourseSchema,
  enrollStudentSchema,
  updateCourseSchema,
  type CourseDetail,
  type CourseSummary,
  type CreateCourseInput,
  type EnrollStudentInput,
  type GradingPolicy,
  type UpdateCourseInput,
} from '@coursewise/shared';
import {
  courseTeachers,
  courses,
  enrollments,
  studentProfiles,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireCourseAccess, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canWriteCourse } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

function toCourseSummary(row: typeof courses.$inferSelect): CourseSummary {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? null,
    termLabel: row.termLabel ?? null,
    status: row.status,
    gradingPolicy: (row.gradingPolicyJson as GradingPolicy | null) ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

r.use('*', requireAuth);

// List courses scoped by role.
r.get('/courses', requireScopeGroup('coursesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') {
    const rows = await db.select().from(courses).orderBy(asc(courses.createdAt));
    return success(c, rows.map(toCourseSummary));
  }
  if (auth.user.role === 'teacher') {
    const rows = await db
      .select({ c: courses })
      .from(courseTeachers)
      .innerJoin(courses, eq(courseTeachers.courseId, courses.id))
      .where(eq(courseTeachers.teacherId, auth.user.id))
      .orderBy(asc(courses.createdAt));
    return success(c, rows.map(({ c: row }) => toCourseSummary(row)));
  }
  // student
  const rows = await db
    .select({ c: courses })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.studentId, auth.user.id), eq(enrollments.status, 'enrolled')))
    .orderBy(asc(courses.createdAt));
  return success(c, rows.map(({ c: row }) => toCourseSummary(row)));
});

// Create a course. Admin or teacher.
r.post('/courses', requireScopeGroup('coursesWrite'), validateJson(createCourseSchema), async (c) => {
  const auth = c.get('auth');
  if (auth.user.role === 'student') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot create courses');
  }
  const input = c.get('validated') as CreateCourseInput;
  const db = c.get('db');

  // Conflict check on code (case-insensitive via citext-like compare; the
  // unique index is on plain code, so we treat case-insensitive via uppercase).
  const existing = await db.select().from(courses).where(eq(courses.code, input.code)).limit(1);
  if (existing.length > 0) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Course code already in use');
  }

  const policy = (input.gradingPolicy ?? DEFAULT_GRADING_POLICY) as GradingPolicy;

  const inserted = await db
    .insert(courses)
    .values({
      code: input.code,
      title: input.title,
      description: input.description ?? null,
      termLabel: input.termLabel ?? null,
      status: input.status ?? 'active',
      gradingPolicyJson: policy,
    })
    .returning();
  const created = inserted[0];
  if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create course');

  let teacherId = auth.user.role === 'teacher' ? auth.user.id : null;
  if (auth.user.role === 'admin' && input.teacherId) {
    const teacherRow = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, input.teacherId))
      .limit(1);
    if (teacherRow.length === 0 || teacherRow[0]?.role !== 'teacher') {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'teacherId must be an existing teacher');
    }
    teacherId = input.teacherId;
  }
  if (teacherId) {
    await db.insert(courseTeachers).values({
      courseId: created.id,
      teacherId,
      role: 'primary',
    });
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'course.create',
    target: created.id,
    metadata: { code: created.code, teacherId },
  });

  return success(c, toCourseSummary(created), 201);
});

// Read a single course (with teachers + enrollment count).
r.get('/courses/:courseId', requireScopeGroup('coursesRead'), requireCourseAccess(), requireTokenCourseAccess(), async (c) => {
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  const row = (await db.select().from(courses).where(eq(courses.id, courseId)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

  const teacherRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: courseTeachers.role,
    })
    .from(courseTeachers)
    .innerJoin(users, eq(courseTeachers.teacherId, users.id))
    .where(eq(courseTeachers.courseId, courseId));

  const enrolledRows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')));

  const detail: CourseDetail = {
    ...toCourseSummary(row),
    teachers: teacherRows.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      role: t.role ?? 'primary',
    })),
    enrollmentCount: enrolledRows.length,
  };
  return success(c, detail);
});

// Update a course.
r.patch(
  '/courses/:courseId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateCourseSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateCourseInput;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.code !== undefined) patch.code = input.code;
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.termLabel !== undefined) patch.termLabel = input.termLabel;
    if (input.status !== undefined) {
      patch.status = input.status;
      patch.archivedAt = input.status === 'archived' ? new Date().toISOString() : null;
    }
    if (input.gradingPolicy !== undefined) patch.gradingPolicyJson = input.gradingPolicy;

    if (input.code !== undefined) {
      const existing = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.code, input.code))
        .limit(1);
      if (existing.length > 0 && existing[0]?.id !== courseId) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Course code already in use');
      }
    }

    const [updated] = await db
      .update(courses)
      .set(patch)
      .where(eq(courses.id, courseId))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.update',
      target: courseId,
      metadata: { fields: Object.keys(patch) },
    });

    return success(c, toCourseSummary(updated));
  },
);

// Delete a course (only when no enrollments).
r.delete('/courses/:courseId', requireScopeGroup('coursesWrite'), requireTokenCourseAccess(), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  if (!(await canWriteCourse(db, auth.user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const enrolledRows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .limit(1);
  if (enrolledRows.length > 0) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Course has enrollments; drop them first');
  }
  const result = await db.delete(courses).where(eq(courses.id, courseId)).returning({ id: courses.id });
  if (result.length === 0) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'course.delete',
    target: courseId,
  });

  return success(c, { id: courseId });
});

async function setCourseStatus(c: Context<AppEnv>, status: 'archived' | 'active') {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  if (!(await canWriteCourse(db, auth.user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const [updated] = await db
    .update(courses)
    .set({
      status,
      archivedAt: status === 'archived' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(courses.id, courseId))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: status === 'archived' ? 'course.archive' : 'course.activate',
    target: courseId,
  });
  return success(c, toCourseSummary(updated));
}

r.post('/courses/:courseId/archive', requireScopeGroup('coursesWrite'), requireTokenCourseAccess(), (c) =>
  setCourseStatus(c, 'archived'),
);
r.post('/courses/:courseId/activate', requireScopeGroup('coursesWrite'), requireTokenCourseAccess(), (c) =>
  setCourseStatus(c, 'active'),
);

// Enrollments
r.get(
  '/courses/:courseId/students',
  requireScopeGroup('coursesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    if (auth.user.role === 'student') {
      // students do not see the full roster — only their own enrollment.
      const db = c.get('db');
      const courseId = requireParam(c, 'courseId');
      const rows = await db
        .select({
          id: enrollments.id,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          enrolledAt: enrollments.enrolledAt,
          status: enrollments.status,
        })
        .from(enrollments)
        .innerJoin(users, eq(enrollments.studentId, users.id))
        .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, auth.user.id)));
      return success(c, rows);
    }
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const rows = await db
      .select({
        id: enrollments.id,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        enrolledAt: enrollments.enrolledAt,
        status: enrollments.status,
        studentNumber: studentProfiles.studentNumber,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(asc(users.name));
    return success(c, rows);
  },
);

r.post(
  '/courses/:courseId/enrollments',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(enrollStudentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as EnrollStudentInput;
    const student = (
      await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.studentId))
        .limit(1)
    )[0];
    if (!student) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Student not found');
    }
    if (student.role !== 'student') {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'User is not a student');
    }
    const existing = await db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, input.studentId)))
      .limit(1);
    if (existing.length > 0) {
      if (existing[0]?.status === 'enrolled') {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Student already enrolled');
      }
      await db
        .update(enrollments)
        .set({ status: 'enrolled', updatedAt: new Date().toISOString() })
        .where(eq(enrollments.id, existing[0]!.id));
    } else {
      await db.insert(enrollments).values({
        courseId,
        studentId: input.studentId,
        status: 'enrolled',
      });
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.enroll',
      target: courseId,
      metadata: { studentId: input.studentId },
    });

    return success(c, { ok: true }, 201);
  },
);

r.delete(
  '/courses/:courseId/enrollments/:studentId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const studentId = requireParam(c, 'studentId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const result = await db
      .delete(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, studentId)))
      .returning({ id: enrollments.id });
    if (result.length === 0) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Enrollment not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.unenroll',
      target: courseId,
      metadata: { studentId },
    });
    return success(c, { ok: true });
  },
);

export default r;
