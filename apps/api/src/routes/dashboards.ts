import { Hono } from 'hono';
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
  AdminActivityPoint,
  AdminActivityResponse,
  AdminDashboardResponse,
  AlertSummary,
  StudentCourseSnapshot,
  StudentDashboardResponse,
  TeacherCourseSnapshot,
  TeacherDashboardResponse,
} from '@coursewise/shared';
import {
  alerts,
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseTeachers,
  courses,
  discussionPosts,
  enrollments,
  finalGrades,
  quizAnswers,
  quizAttempts,
  quizzes,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { toAlertSummary } from '../services/alertRules';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

r.get('/dashboards/admin', requireScopeGroup('dashboardsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role !== 'admin') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Admin only');
  }
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // All eight aggregates are independent — issue them concurrently instead of
  // serially awaiting eight round-trips to Neon.
  const [
    [usersTotal],
    [teachersTotal],
    [studentsTotal],
    [coursesTotal],
    [activeCoursesTotal],
    [openAlertsTotal],
    [lateSubmissions7d],
    recentAlertRows,
  ] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(users),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'teacher')),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'student')),
    db.select({ c: sql<number>`count(*)::int` }).from(courses),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(courses)
      .where(eq(courses.status, 'active')),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(alerts)
      .where(eq(alerts.status, 'open')),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.status, 'late'),
          sql`${assignmentSubmissions.updatedAt} >= ${sinceIso}`,
        ),
      ),
    db
      .select()
      .from(alerts)
      .where(eq(alerts.status, 'open'))
      .orderBy(desc(alerts.createdAt))
      .limit(10),
  ]);
  const latestAlerts: AlertSummary[] = recentAlertRows.map(toAlertSummary);
  const body: AdminDashboardResponse = {
    totals: {
      users: usersTotal?.c ?? 0,
      teachers: teachersTotal?.c ?? 0,
      students: studentsTotal?.c ?? 0,
      courses: coursesTotal?.c ?? 0,
      activeCourses: activeCoursesTotal?.c ?? 0,
      openAlerts: openAlertsTotal?.c ?? 0,
    },
    latestAlerts,
    lateSubmissionsLast7d: lateSubmissions7d?.c ?? 0,
  };
  return success(c, body);
});

// Daily system-activity counts for the dashboard's overview-over-time chart.
// One cheap date_trunc + count per series, zero-filled so every day in the
// range is present.
r.get('/dashboards/admin/activity', requireScopeGroup('dashboardsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role !== 'admin') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Admin only');
  }
  const raw = Number.parseInt(c.req.query('days') ?? '30', 10);
  const days = Number.isNaN(raw) ? 30 : Math.min(90, Math.max(7, raw));
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const points: AdminActivityPoint[] = [];
  const byDate = new Map<string, AdminActivityPoint>();
  for (let i = 0; i < days; i++) {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const point: AdminActivityPoint = {
      date,
      newUsers: 0,
      enrollments: 0,
      submissions: 0,
      quizAttempts: 0,
      posts: 0,
    };
    points.push(point);
    byDate.set(date, point);
  }

  type DayCount = { day: string; n: number };
  const fill = (rows: DayCount[], field: keyof Omit<AdminActivityPoint, 'date'>): void => {
    for (const row of rows) {
      const point = byDate.get(String(row.day).slice(0, 10));
      if (point) point[field] = row.n;
    }
  };
  const dayCount = { n: sql<number>`count(*)::int` };

  // Five independent per-day aggregates — run them concurrently.
  const [newUserRows, enrollmentRows, submissionRows, attemptRows, postRows] = await Promise.all([
    db
      .select({ day: sql<string>`(date_trunc('day', ${users.createdAt} AT TIME ZONE 'UTC'))::date`, ...dayCount })
      .from(users)
      .where(sql`${users.createdAt} >= ${sinceIso}`)
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`(date_trunc('day', ${enrollments.createdAt} AT TIME ZONE 'UTC'))::date`, ...dayCount })
      .from(enrollments)
      .where(sql`${enrollments.createdAt} >= ${sinceIso}`)
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`(date_trunc('day', ${assignmentSubmissions.submittedAt} AT TIME ZONE 'UTC'))::date`, ...dayCount })
      .from(assignmentSubmissions)
      .where(sql`${assignmentSubmissions.submittedAt} >= ${sinceIso}`)
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`(date_trunc('day', ${quizAttempts.startedAt} AT TIME ZONE 'UTC'))::date`, ...dayCount })
      .from(quizAttempts)
      .where(sql`${quizAttempts.startedAt} >= ${sinceIso}`)
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`(date_trunc('day', ${discussionPosts.createdAt} AT TIME ZONE 'UTC'))::date`, ...dayCount })
      .from(discussionPosts)
      .where(and(eq(discussionPosts.isDeleted, false), sql`${discussionPosts.createdAt} >= ${sinceIso}`))
      .groupBy(sql`1`),
  ]);
  fill(newUserRows, 'newUsers');
  fill(enrollmentRows, 'enrollments');
  fill(submissionRows, 'submissions');
  fill(attemptRows, 'quizAttempts');
  fill(postRows, 'posts');

  const body: AdminActivityResponse = { days, points };
  return success(c, body);
});

r.get('/dashboards/teacher', requireScopeGroup('dashboardsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role !== 'teacher' && auth.user.role !== 'admin') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Teachers and admins only');
  }
  const courseRows =
    auth.user.role === 'admin'
      ? await db
          .select({ id: courses.id, code: courses.code, title: courses.title })
          .from(courses)
          .orderBy(asc(courses.title))
      : await db
          .select({ id: courses.id, code: courses.code, title: courses.title })
          .from(courseTeachers)
          .innerJoin(courses, eq(courseTeachers.courseId, courses.id))
          .where(eq(courseTeachers.teacherId, auth.user.id))
          .orderBy(asc(courses.title));
  const courseIds = courseRows.map((row) => row.id);
  if (courseIds.length === 0) {
    const body: TeacherDashboardResponse = { courses: [], recentAlerts: [] };
    return success(c, body);
  }
  // One grouped aggregate per metric across all courses (instead of ~5
  // queries per course), all five round-trips issued concurrently.
  const [enrollmentRows, ungradedSubRows, ungradedAnswerRows, openAlertRows, recentAlerts] =
    await Promise.all([
      db
        .select({ courseId: enrollments.courseId, c: sql<number>`count(*)::int` })
        .from(enrollments)
        .where(and(inArray(enrollments.courseId, courseIds), eq(enrollments.status, 'enrolled')))
        .groupBy(enrollments.courseId),
      // Ungraded submissions: status submitted/late with score null.
      db
        .select({ courseId: assignments.courseId, c: sql<number>`count(*)::int` })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
        .where(
          and(
            inArray(assignments.courseId, courseIds),
            inArray(assignmentSubmissions.status, ['submitted', 'late']),
            isNull(assignmentSubmissions.score),
          ),
        )
        .groupBy(assignments.courseId),
      // Ungraded quiz answers (subjective): pointsAwarded null on submitted attempts.
      db
        .select({ courseId: quizzes.courseId, c: sql<number>`count(distinct ${quizAnswers.id})::int` })
        .from(quizAnswers)
        .innerJoin(quizAttempts, eq(quizAnswers.attemptId, quizAttempts.id))
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .where(
          and(
            inArray(quizzes.courseId, courseIds),
            eq(quizAttempts.status, 'submitted'),
            isNull(quizAnswers.pointsAwarded),
          ),
        )
        .groupBy(quizzes.courseId),
      db
        .select({ courseId: alerts.courseId, c: sql<number>`count(*)::int` })
        .from(alerts)
        .where(and(inArray(alerts.courseId, courseIds), eq(alerts.status, 'open')))
        .groupBy(alerts.courseId),
      db
        .select()
        .from(alerts)
        .where(and(eq(alerts.status, 'open'), inArray(alerts.courseId, courseIds)))
        .orderBy(desc(alerts.createdAt))
        .limit(10),
    ]);
  const countByCourse = (rows: { courseId: string | null; c: number }[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.courseId !== null) map.set(row.courseId, row.c);
    }
    return map;
  };
  const enrollmentByCourse = countByCourse(enrollmentRows);
  const ungradedSubsByCourse = countByCourse(ungradedSubRows);
  const ungradedAnswersByCourse = countByCourse(ungradedAnswerRows);
  const openAlertsByCourse = countByCourse(openAlertRows);
  const snapshots: TeacherCourseSnapshot[] = courseRows.map((courseRow) => ({
    courseId: courseRow.id,
    courseCode: courseRow.code,
    courseTitle: courseRow.title,
    enrollmentCount: enrollmentByCourse.get(courseRow.id) ?? 0,
    ungradedSubmissions: ungradedSubsByCourse.get(courseRow.id) ?? 0,
    ungradedQuizAnswers: ungradedAnswersByCourse.get(courseRow.id) ?? 0,
    openAlerts: openAlertsByCourse.get(courseRow.id) ?? 0,
  }));
  const body: TeacherDashboardResponse = {
    courses: snapshots,
    recentAlerts: recentAlerts.map(toAlertSummary),
  };
  return success(c, body);
});

r.get('/dashboards/student', requireScopeGroup('dashboardsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role !== 'student' && auth.user.role !== 'admin') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students and admins only');
  }
  // For admin, allow `?studentId=` query; for student, fixed to self.
  const studentId = auth.user.role === 'student' ? auth.user.id : c.req.query('studentId');
  if (!studentId) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'studentId required');
  }
  const enrolledCourses = await db
    .select({ id: courses.id, code: courses.code, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, 'enrolled')))
    .orderBy(asc(courses.title));
  const snapshots: StudentCourseSnapshot[] = [];
  const nowIso = new Date().toISOString();
  for (const courseRow of enrolledCourses) {
    // attendance rate
    const [sessionCount] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseRow.id));
    let attendanceRate: number | null = null;
    if (sessionCount && sessionCount.c > 0) {
      const sessionIds = (
        await db
          .select({ id: attendanceSessions.id })
          .from(attendanceSessions)
          .where(eq(attendanceSessions.courseId, courseRow.id))
      ).map((s) => s.id);
      const recs = await db
        .select({ status: attendanceRecords.status })
        .from(attendanceRecords)
        .where(
          and(
            inArray(attendanceRecords.sessionId, sessionIds),
            eq(attendanceRecords.studentId, studentId),
          ),
        );
      const present = recs.filter(
        (r) => r.status === 'present' || r.status === 'late' || r.status === 'excused',
      ).length;
      attendanceRate = present / sessionCount.c;
    }
    // assignment average
    const courseAssignmentIds = (
      await db
        .select({ id: assignments.id, maxScore: assignments.maxScore })
        .from(assignments)
        .where(eq(assignments.courseId, courseRow.id))
    );
    let assignmentAverage: number | null = null;
    let upcoming = 0;
    if (courseAssignmentIds.length > 0) {
      const ids = courseAssignmentIds.map((a) => a.id);
      const subs = await db
        .select({
          assignmentId: assignmentSubmissions.assignmentId,
          score: assignmentSubmissions.score,
        })
        .from(assignmentSubmissions)
        .where(
          and(
            inArray(assignmentSubmissions.assignmentId, ids),
            eq(assignmentSubmissions.studentId, studentId),
          ),
        );
      const maxByA = new Map(
        courseAssignmentIds.map((a) => [a.id, a.maxScore !== null ? Number(a.maxScore) : 100]),
      );
      const scored = subs.filter((s) => s.score !== null);
      if (scored.length > 0) {
        let sum = 0;
        for (const s of scored) {
          const max = maxByA.get(s.assignmentId) ?? 100;
          if (max) sum += (Number(s.score) / max) * 100;
        }
        assignmentAverage = sum / scored.length;
      }
      // Upcoming: assignments with due date in future, no submission yet.
      const upcomingRows = await db
        .select({
          id: assignments.id,
          dueDate: assignments.dueDate,
          status: assignments.status,
        })
        .from(assignments)
        .where(
          and(
            eq(assignments.courseId, courseRow.id),
            eq(assignments.status, 'published'),
            gt(assignments.dueDate, nowIso),
          ),
        );
      const submittedIds = new Set(
        subs
          .filter((s) => s.score !== null || s.assignmentId)
          .map((s) => s.assignmentId),
      );
      upcoming = upcomingRows.filter((a) => !submittedIds.has(a.id)).length;
    }
    // quiz average (best per quiz)
    let quizAverage: number | null = null;
    const courseQuizIds = (
      await db
        .select({ id: quizzes.id })
        .from(quizzes)
        .where(eq(quizzes.courseId, courseRow.id))
    ).map((q) => q.id);
    if (courseQuizIds.length > 0) {
      const attempts = await db
        .select({
          quizId: quizAttempts.quizId,
          score: quizAttempts.score,
          maxScore: quizAttempts.maxScore,
          status: quizAttempts.status,
        })
        .from(quizAttempts)
        .where(
          and(
            inArray(quizAttempts.quizId, courseQuizIds),
            eq(quizAttempts.studentId, studentId),
          ),
        );
      const best = new Map<string, { score: number; maxScore: number }>();
      for (const a of attempts) {
        if ((a.status !== 'submitted' && a.status !== 'expired') || a.score === null || a.maxScore === null) continue;
        const prev = best.get(a.quizId);
        const v = { score: Number(a.score), maxScore: Number(a.maxScore) };
        if (!prev || v.score > prev.score) best.set(a.quizId, v);
      }
      if (best.size > 0) {
        let sum = 0;
        let n = 0;
        for (const v of best.values()) {
          if (!v.maxScore) continue;
          sum += (v.score / v.maxScore) * 100;
          n += 1;
        }
        if (n > 0) quizAverage = sum / n;
      }
    }
    // final grade
    const [fg] = await db
      .select()
      .from(finalGrades)
      .where(
        and(eq(finalGrades.courseId, courseRow.id), eq(finalGrades.studentId, studentId)),
      )
      .limit(1);
    const [openAlertsRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(alerts)
      .where(
        and(
          eq(alerts.userId, studentId),
          eq(alerts.courseId, courseRow.id),
          eq(alerts.status, 'open'),
        ),
      );
    snapshots.push({
      courseId: courseRow.id,
      courseCode: courseRow.code,
      courseTitle: courseRow.title,
      attendanceRate,
      assignmentAverage,
      quizAverage,
      upcomingAssignments: upcoming,
      openAlerts: openAlertsRow?.c ?? 0,
      finalScore: fg?.score !== null && fg?.score !== undefined ? Number(fg.score) : null,
      letterGrade: fg?.letterGrade ?? null,
    });
  }
  const recentAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, studentId), eq(alerts.status, 'open')))
    .orderBy(desc(alerts.createdAt))
    .limit(10);
  const body: StudentDashboardResponse = {
    courses: snapshots,
    recentAlerts: recentAlerts.map(toAlertSummary),
  };
  return success(c, body);
});

// suppress unused
void lte;

export default r;
