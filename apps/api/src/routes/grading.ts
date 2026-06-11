import { Hono } from 'hono';
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import {
  overrideFinalGradeSchema,
  updateGradingPolicySchema,
  type FinalGradeSummary,
  type GradingPolicySummary,
  type OverrideFinalGradeInput,
  type RecalculateFinalGradesResult,
  type UpdateGradingPolicyInput,
} from '@coursewise/shared';
import {
  assignmentGroups,
  assignmentSubmissions,
  assignments,
  courses,
  enrollments,
  finalGrades,
  groupMemberships,
  groupSubmissions,
  studentProfiles,
  users,
} from '../db/schema';
import type { CourseGradingSummary, GradingTaskItem } from '@coursewise/shared';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireCourseAccess, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import {
  applyTeacherOverride,
  buildGradebookStudentDetail,
  isItemPosted,
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
        studentNumber: studentProfiles.studentNumber,
      })
      .from(finalGrades)
      .innerJoin(users, eq(finalGrades.studentId, users.id))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(eq(finalGrades.courseId, courseId))
      .orderBy(asc(users.name));
    // Per-student count of teacher-overridden item scores: graded with no
    // submitted_at means the score was entered without a submission (work
    // handed in by email/paper, graded drafts).
    const overrideRows = await db.execute(sql`
      SELECT s.student_id AS sid, count(*)::int AS n
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE a.course_id = ${courseId}
        AND s.graded_at IS NOT NULL
        AND s.submitted_at IS NULL
      GROUP BY s.student_id
    `);
    const overrideBySid = new Map(
      (overrideRows.rows as Array<{ sid: string; n: number }>).map((r) => [r.sid, Number(r.n)]),
    );
    const out: FinalGradeSummary[] = rows.map(({ g, name, email, studentNumber }) =>
      toFinalGradeSummary(g, {
        studentName: name,
        studentEmail: email,
        studentNumber,
        overrideCount: overrideBySid.get(g.studentId) ?? 0,
      }),
    );
    return success(c, out);
  },
);

// Course-level "set missing to 0": for every enrolled student and every
// posted, gradable assignment, score never-handed-in work (no submission row,
// or an unscored draft) as 0. Submitted-awaiting-grade and graded work is
// untouched. Group-mode pairs whose group has a group submission are skipped —
// their member rows belong to the fan-out path, not the zero path.
r.post(
  '/courses/:courseId/gradebook/zero-missing',
  requireScopeGroup('gradesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    const now = Date.now();
    const [assignRows, enrolledRows] = await Promise.all([
      // Gradable = counts toward the gradebook: attached to a grading group or
      // set, posted (non-draft, started), and has a max score.
      db
        .select({
          id: assignments.id,
          status: assignments.status,
          startDate: assignments.startDate,
          submissionMode: assignments.submissionMode,
          groupSetId: assignments.groupSetId,
        })
        .from(assignments)
        .where(
          and(
            eq(assignments.courseId, courseId),
            or(isNotNull(assignments.groupId), isNotNull(assignments.setId)),
            isNotNull(assignments.maxScore),
          ),
        ),
      db
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled'))),
    ]);
    const gradable = assignRows.filter((a) =>
      isItemPosted({ status: a.status, startAt: a.startDate }, now),
    );
    const studentIds = enrolledRows.map((r2) => r2.studentId);
    if (gradable.length === 0 || studentIds.length === 0) {
      return success(c, { updated: 0 });
    }
    const assignmentIds = gradable.map((a) => a.id);

    const subs = await db
      .select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        status: assignmentSubmissions.status,
        score: assignmentSubmissions.score,
      })
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, assignmentIds),
          inArray(assignmentSubmissions.studentId, studentIds),
        ),
      );
    const subByPair = new Map<string, (typeof subs)[number]>();
    for (const sub of subs) subByPair.set(`${sub.assignmentId}:${sub.studentId}`, sub);

    // Group-mode safety: a member whose row is missing while their group HAS a
    // submission must not be zeroed (the row appears via fan-out instead).
    const groupModeAssignments = gradable.filter(
      (a) => a.submissionMode === 'group' && a.groupSetId,
    );
    const coveredPairs = new Set<string>();
    if (groupModeAssignments.length > 0) {
      const groupRows = await db
        .select({
          assignmentId: groupSubmissions.assignmentId,
          studentId: groupMemberships.studentId,
        })
        .from(groupSubmissions)
        .innerJoin(groupMemberships, eq(groupMemberships.groupId, groupSubmissions.groupId))
        .where(
          inArray(
            groupSubmissions.assignmentId,
            groupModeAssignments.map((a) => a.id),
          ),
        );
      for (const row of groupRows) coveredPairs.add(`${row.assignmentId}:${row.studentId}`);
    }

    const nowIso = new Date().toISOString();
    const zeroFields = {
      score: '0',
      rawScore: '0',
      latePenaltyPercent: '0',
      latePenaltyWaived: false,
      status: 'graded' as const,
      gradedAt: nowIso,
      gradedById: auth.user.id,
      updatedAt: nowIso,
    };

    const draftIds: string[] = [];
    const missingPairs: Array<{ assignmentId: string; studentId: string }> = [];
    for (const a of gradable) {
      for (const sid of studentIds) {
        const key = `${a.id}:${sid}`;
        const sub = subByPair.get(key);
        if (sub) {
          if (sub.status === 'draft' && sub.score === null) draftIds.push(sub.id);
        } else if (!coveredPairs.has(key)) {
          missingPairs.push({ assignmentId: a.id, studentId: sid });
        }
      }
    }

    const CHUNK = 100;
    for (let i = 0; i < draftIds.length; i += CHUNK) {
      await db
        .update(assignmentSubmissions)
        .set(zeroFields)
        .where(inArray(assignmentSubmissions.id, draftIds.slice(i, i + CHUNK)));
    }
    for (let i = 0; i < missingPairs.length; i += CHUNK) {
      await db
        .insert(assignmentSubmissions)
        .values(missingPairs.slice(i, i + CHUNK).map((pair) => ({ ...pair, ...zeroFields })))
        .onConflictDoNothing({
          target: [assignmentSubmissions.assignmentId, assignmentSubmissions.studentId],
        });
    }

    const updated = draftIds.length + missingPairs.length;
    if (updated > 0) {
      await db
        .update(finalGrades)
        .set({ isOutdated: true, updatedAt: nowIso })
        .where(eq(finalGrades.courseId, courseId));
    }
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'gradebook.zero-missing',
      target: courseId,
      metadata: { zeroedDrafts: draftIds.length, zeroedMissing: missingPairs.length },
    });
    return success(c, { updated });
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
    const [existing] = await db.select().from(finalGrades).where(eq(finalGrades.id, id)).limit(1);
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

r.get('/me/courses/:courseId/final-grade', requireScopeGroup('gradesRead'), async (c) => {
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
});

// Self-scoped itemized gradebook. A student reads their OWN full breakdown —
// every assignment, quiz, discussion, and attendance item with their own
// score. This is FERPA §99.10 self-inspection (a student viewing their own
// education record), NOT a §99.32 disclosure, so it is deliberately not
// disclosure-logged. Course staff viewing a *specific* student go through the
// disclosure-logged /courses/:courseId/students/:studentId/gradebook-detail
// route instead; this endpoint always resolves to the caller themselves.
r.get('/me/courses/:courseId/gradebook-detail', requireScopeGroup('gradesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  if (auth.user.role !== 'student') {
    throw new ApiException(
      403,
      ERROR_CODES.FORBIDDEN,
      'Only students can view their own gradebook here',
    );
  }
  if (!(await isCourseEnrolled(db, courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
  const policy = await ensureGradingPolicy(db, courseId);
  const detail = await buildGradebookStudentDetail(db, courseId, auth.user.id, policy);
  if (!detail) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'You are not enrolled in this course');
  }
  return success(c, detail);
});

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
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')))
      .orderBy(asc(users.name));
    const gradeRows = await db.select().from(finalGrades).where(eq(finalGrades.courseId, courseId));
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
