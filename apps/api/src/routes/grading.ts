import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  overrideFinalGradeSchema,
  updateGradingPolicySchema,
  type FinalGradeSummary,
  type GradingPolicySummary,
  type OverrideFinalGradeInput,
  type RecalculateFinalGradesResult,
  type UpdateGradingPolicyInput,
} from '@coursewise/shared';
import { courses, enrollments, finalGrades, users } from '../db/schema';
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
import { recordAudit } from '../services/audit';
import {
  canWriteCourse,
  isCourseEnrolled,
  isCourseTeacher,
} from '../services/courseAccess';
import {
  applyTeacherOverride,
  recalculateFinalGrades,
  toFinalGradeSummary,
} from '../services/finalGrade';
import {
  ensureGradingPolicy,
  toGradingPolicySummary,
  updateGradingPolicy,
} from '../services/gradingPolicy';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// =================== Grading policy ===================

r.get(
  '/courses/:courseId/grading-policy',
  requireScopeGroup('gradesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const policy = await ensureGradingPolicy(db, courseId);
    return success(c, policy);
  },
);

r.put(
  '/courses/:courseId/grading-policy',
  requireScopeGroup('gradesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateGradingPolicySchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateGradingPolicyInput;
    const updated = await updateGradingPolicy(db, courseId, input, auth.user.id);
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'grading_policy.update',
      target: courseId,
      metadata: {
        version: updated.version,
        weights: {
          attendance: updated.weightAttendance,
          assignments: updated.weightAssignments,
          quizzes: updated.weightQuizzes,
          discussion: updated.weightDiscussion,
          finalProject: updated.weightFinalProject,
        },
      },
    });
    return success(c, updated);
  },
);

// =================== Final grades ===================

r.get(
  '/courses/:courseId/final-grades',
  requireScopeGroup('gradesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list course grades');
    }
    const rows = await db
      .select({
        g: finalGrades,
        name: users.name,
        email: users.email,
      })
      .from(finalGrades)
      .innerJoin(users, eq(finalGrades.studentId, users.id))
      .where(eq(finalGrades.courseId, courseId))
      .orderBy(asc(users.name));
    const out: FinalGradeSummary[] = rows.map(({ g, name, email }) =>
      toFinalGradeSummary(g, { studentName: name, studentEmail: email }),
    );
    return success(c, out);
  },
);

r.post(
  '/courses/:courseId/final-grades/recalculate',
  requireScopeGroup('gradesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const policy = await ensureGradingPolicy(db, courseId);
    const { updated } = await recalculateFinalGrades(db, courseId, policy, auth.user.id);
    const body: RecalculateFinalGradesResult = {
      courseId,
      total: updated,
      updated,
      policyVersion: policy.version,
    };
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'final_grades.recalculate',
      target: courseId,
      metadata: body as unknown as Record<string, unknown>,
    });
    return success(c, body);
  },
);

r.patch(
  '/final-grades/:finalGradeId',
  requireScopeGroup('gradesWrite'),
  validateJson(overrideFinalGradeSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'finalGradeId');
    const [existing] = await db
      .select()
      .from(finalGrades)
      .where(eq(finalGrades.id, id))
      .limit(1);
    if (!existing) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Final grade not found');
    if (!(await canWriteCourse(db, auth.user, existing.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as OverrideFinalGradeInput;
    const policy = await ensureGradingPolicy(db, existing.courseId);
    const updated = await applyTeacherOverride(
      db,
      id,
      policy,
      input.teacherOverrideScore ?? null,
      input.teacherOverrideReason ?? null,
      auth.user.id,
    );
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Final grade not found');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'final_grade.override',
      target: id,
      metadata: {
        courseId: existing.courseId,
        studentId: existing.studentId,
        teacherOverrideScore: input.teacherOverrideScore ?? null,
        teacherOverrideReason: input.teacherOverrideReason ?? null,
      },
    });
    return success(c, updated);
  },
);

r.get(
  '/me/courses/:courseId/final-grade',
  requireScopeGroup('gradesRead'),
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
    const [row] = await db
      .select()
      .from(finalGrades)
      .where(and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, studentId)))
      .limit(1);
    if (!row) {
      return success(c, null);
    }
    return success(c, toFinalGradeSummary(row));
  },
);

// =================== CSV grade export ===================

function csvEscape(value: string): string {
  if (value === '') return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

r.get(
  '/courses/:courseId/grades/export.csv',
  requireScopeGroup('gradesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot export course grades');
    }
    const [course] = await db
      .select({ code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
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
    const gradeRows = await db
      .select()
      .from(finalGrades)
      .where(eq(finalGrades.courseId, courseId));
    const byStudent = new Map<string, typeof finalGrades.$inferSelect>();
    for (const g of gradeRows) byStudent.set(g.studentId, g);
    const header = [
      'Student',
      'Email',
      'Course Code',
      'Course Title',
      'Score',
      'Letter Grade',
      'Override Score',
      'Override Reason',
      'Outdated',
    ];
    const lines = [header.map(csvEscape).join(',')];
    for (const s of enrolledStudents) {
      const g = byStudent.get(s.id);
      const cells = [
        s.name,
        s.email,
        course?.code ?? '',
        course?.title ?? '',
        g?.score ?? '',
        g?.letterGrade ?? '',
        g?.teacherOverrideScore ?? '',
        g?.teacherOverrideReason ?? '',
        g?.isOutdated ? 'true' : '',
      ];
      lines.push(cells.map((v) => csvEscape(String(v ?? ''))).join(','));
    }
    const body = lines.join('\n');
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="grades-${courseId}.csv"`,
      },
    });
  },
);

// Suppress unused imports the linter may flag.
void sql;
void toGradingPolicySummary;

export default r;
export type _gradingTypes = GradingPolicySummary;
