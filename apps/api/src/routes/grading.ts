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
import { assignmentGroups, courses, enrollments, finalGrades, users } from '../db/schema';
import type { CourseGradingSummary, GradingTaskItem } from '@coursewise/shared';
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
  buildGradebookStudentDetail,
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
    const weightRows = await db
      .select({ weight: assignmentGroups.weight })
      .from(assignmentGroups)
      .where(eq(assignmentGroups.courseId, courseId));
    const groupWeight = weightRows.reduce((acc, r) => acc + r.weight, 0);
    const totalWeight = policy.weightAttendance + groupWeight;
    if (totalWeight !== 100) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Attendance + assignment-group weights must sum to 100 (currently ${totalWeight})`,
      );
    }
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
  '/courses/:courseId/students/:studentId/gradebook-detail',
  requireScopeGroup('gradesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const studentId = requireParam(c, 'studentId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot view gradebook detail');
    }
    const policy = await ensureGradingPolicy(db, courseId);
    const detail = await buildGradebookStudentDetail(db, courseId, studentId, policy);
    if (!detail) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Student is not enrolled in this course');
    }

    // FERPA §99.32(a): course staff viewing a specific student's gradebook
    // breakdown is a disclosure of that student's education record.
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'gradebook.student.view',
      target: courseId,
      disclosedStudentIds: studentId,
    });

    return success(c, detail);
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

// =================== Per-course grading summary ===================

// Counts of items waiting for a teacher to grade. Used by the teacher's
// course overview page to surface "you have N things to grade right now".
r.get(
  '/courses/:courseId/grading-summary',
  requireScopeGroup('gradesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Teachers and admins only');
    }
    if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }

    // Per-assignment ungraded backlog: submissions in (submitted, late) with no
    // score yet. Counted as de-duped "submission units" — COALESCE(group
    // submission, row) so a group assignment counts once per group, matching the
    // ungraded badge on the Assignments list.
    const aRes = await db.execute(sql`
      SELECT a.id AS id,
             a.title AS title,
             COUNT(DISTINCT COALESCE(sub.group_submission_id, sub.id))::int AS count
        FROM assignment_submissions sub
        JOIN assignments a ON a.id = sub.assignment_id
       WHERE a.course_id = ${courseId}
         AND sub.status IN ('submitted', 'late')
         AND sub.score IS NULL
       GROUP BY a.id, a.title
       ORDER BY count DESC, a.title ASC
    `);
    const assignmentTasks = aRes.rows as unknown as GradingTaskItem[];

    // Per-quiz ungraded backlog: distinct quiz_answers awaiting manual grading
    // (pointsAwarded IS NULL on submitted attempts).
    const qRes = await db.execute(sql`
      SELECT z.id AS id,
             z.title AS title,
             COUNT(DISTINCT qa.id)::int AS count
        FROM quiz_answers qa
        JOIN quiz_attempts att ON att.id = qa.attempt_id
        JOIN quizzes z          ON z.id = att.quiz_id
       WHERE z.course_id = ${courseId}
         AND att.status = 'submitted'
         AND qa.points_awarded IS NULL
       GROUP BY z.id, z.title
       ORDER BY count DESC, z.title ASC
    `);
    const quizTasks = qRes.rows as unknown as GradingTaskItem[];

    // Per-topic ungraded backlog: (topic, student) pairs in graded topics where
    // the student has posted at least once and the discussion_grades row is
    // missing or ungraded.
    const dRes = await db.execute(sql`
      SELECT dt.id AS id,
             dt.title AS title,
             COUNT(*)::int AS count
        FROM (
          SELECT DISTINCT dp.author_id AS student_id, dt.id AS topic_id
            FROM discussion_topics dt
            JOIN discussion_posts dp ON dp.topic_id = dt.id AND dp.is_deleted = false
            JOIN enrollments e
              ON e.course_id = dt.course_id
             AND e.student_id = dp.author_id
             AND e.status = 'enrolled'
           WHERE dt.course_id = ${courseId}
             AND dt.is_graded = true
        ) posted
        LEFT JOIN discussion_grades dg
               ON dg.topic_id = posted.topic_id
              AND dg.student_id = posted.student_id
        JOIN discussion_topics dt ON dt.id = posted.topic_id
       WHERE dg.graded_at IS NULL
       GROUP BY dt.id, dt.title
       ORDER BY count DESC, dt.title ASC
    `);
    const discussionTasks = dRes.rows as unknown as GradingTaskItem[];

    // Aggregate totals (still consumed by the course overview) are the sum of
    // each per-item backlog, so the two surfaces never disagree.
    const sumCounts = (items: GradingTaskItem[]): number =>
      items.reduce((total, item) => total + item.count, 0);

    const summary: CourseGradingSummary = {
      courseId,
      ungradedSubmissions: sumCounts(assignmentTasks),
      ungradedQuizAnswers: sumCounts(quizTasks),
      ungradedDiscussions: sumCounts(discussionTasks),
      assignmentTasks,
      quizTasks,
      discussionTasks,
    };
    return success(c, summary);
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

    // FERPA §99.32(a): bulk grade export is a disclosure of every enrolled
    // student's education record. One audit row per student so the
    // disclosure log can answer "who exported student X's grades?".
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'grades.export.csv',
      target: courseId,
      metadata: { studentCount: enrolledStudents.length },
      disclosedStudentIds: enrolledStudents.map((s) => s.id),
    });

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
