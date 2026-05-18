import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  ALERT_RULES,
  type AlertSeverity,
  type AlertSummary,
  type AlertType,
  type GenerateAlertsResult,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  alerts,
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  courses,
  discussionPosts,
  discussionTopics,
  enrollments,
  quizAttempts,
  quizzes,
  users,
} from '../db/schema';

export function toAlertSummary(row: typeof alerts.$inferSelect): AlertSummary {
  return {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId ?? null,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    body: row.body ?? null,
    linkUrl: row.linkUrl ?? null,
    metadata: (row.metadataJson ?? null) as Record<string, unknown> | null,
    readAt: row.readAt ?? null,
    resolvedAt: row.resolvedAt ?? null,
    resolvedById: row.resolvedById ?? null,
    resolutionNote: row.resolutionNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface UpsertAlertInput {
  userId: string;
  courseId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function upsertOpenAlert(db: Db, input: UpsertAlertInput): Promise<boolean> {
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.userId, input.userId),
        input.courseId
          ? eq(alerts.courseId, input.courseId)
          : sql`${alerts.courseId} IS NULL`,
        eq(alerts.type, input.type),
        eq(alerts.status, 'open'),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    const now = new Date().toISOString();
    await db
      .update(alerts)
      .set({
        severity: input.severity,
        title: input.title,
        body: input.body ?? null,
        metadataJson: input.metadata ?? null,
        updatedAt: now,
      })
      .where(eq(alerts.id, existing[0]!.id));
    return false;
  }
  await db.insert(alerts).values({
    userId: input.userId,
    courseId: input.courseId,
    type: input.type,
    severity: input.severity,
    status: 'open',
    title: input.title,
    body: input.body ?? null,
    metadataJson: input.metadata ?? null,
  });
  return true;
}

export interface AttendanceStats {
  sessions: number;
  present: number;
  rate: number;
}

export interface ConsecutiveAbsenceStats {
  longestStreak: number;
}

export function consecutiveAbsenceStreak(
  statuses: Array<'present' | 'absent' | 'late' | 'excused' | null>,
): number {
  let longest = 0;
  let current = 0;
  for (const s of statuses) {
    if (s === 'absent') {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

export interface LateSubmissionStats {
  count: number;
}

export async function evaluateCourseAlerts(
  db: Db,
  courseId: string,
): Promise<GenerateAlertsResult> {
  const enrolled = await db
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')));
  const studentIds = enrolled.map((e) => e.studentId);
  const result: GenerateAlertsResult = {
    courseId,
    generated: 0,
    byType: {},
  };
  if (studentIds.length === 0) return result;

  const [course] = await db
    .select({ title: courses.title, code: courses.code })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  const courseTitle = course?.title ?? 'this course';

  // Load sessions + per-student attendance ordered chronologically.
  const sessionRows = await db
    .select({ id: attendanceSessions.id, date: attendanceSessions.sessionDate })
    .from(attendanceSessions)
    .where(eq(attendanceSessions.courseId, courseId))
    .orderBy(asc(attendanceSessions.sessionDate));
  const sessionsCount = sessionRows.length;
  const sessionOrder = sessionRows.map((s) => s.id);
  const recordsByStudent = new Map<string, Map<string, 'present' | 'absent' | 'late' | 'excused'>>();
  if (sessionsCount > 0) {
    const recs = await db
      .select({
        sessionId: attendanceRecords.sessionId,
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .where(
        and(
          inArray(attendanceRecords.sessionId, sessionOrder),
          inArray(attendanceRecords.studentId, studentIds),
        ),
      );
    for (const r of recs) {
      const inner = recordsByStudent.get(r.studentId) ?? new Map();
      inner.set(r.sessionId, r.status);
      recordsByStudent.set(r.studentId, inner);
    }
  }

  // Assignments / submissions for late-submission count.
  const courseAssignmentIds = (
    await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.courseId, courseId))
  ).map((a) => a.id);
  const lateCountByStudent = new Map<string, number>();
  if (courseAssignmentIds.length > 0) {
    const subs = await db
      .select({
        studentId: assignmentSubmissions.studentId,
        status: assignmentSubmissions.status,
      })
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, courseAssignmentIds),
          inArray(assignmentSubmissions.studentId, studentIds),
        ),
      );
    for (const s of subs) {
      if (s.status === 'late') {
        lateCountByStudent.set(s.studentId, (lateCountByStudent.get(s.studentId) ?? 0) + 1);
      }
    }
  }

  // Quizzes: per-student best-attempt average percent.
  const courseQuizIds = (
    await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.courseId, courseId))
  ).map((q) => q.id);
  const quizAvgByStudent = new Map<string, number | null>();
  if (courseQuizIds.length > 0) {
    const attempts = await db
      .select({
        quizId: quizAttempts.quizId,
        studentId: quizAttempts.studentId,
        score: quizAttempts.score,
        maxScore: quizAttempts.maxScore,
        status: quizAttempts.status,
      })
      .from(quizAttempts)
      .where(
        and(
          inArray(quizAttempts.quizId, courseQuizIds),
          inArray(quizAttempts.studentId, studentIds),
        ),
      );
    const best = new Map<string, { score: number; maxScore: number }>();
    for (const a of attempts) {
      if ((a.status !== 'submitted' && a.status !== 'expired') || a.score === null || a.maxScore === null) continue;
      const key = `${a.quizId}:${a.studentId}`;
      const v = { score: Number(a.score), maxScore: Number(a.maxScore) };
      const prev = best.get(key);
      if (!prev || v.score > prev.score) best.set(key, v);
    }
    const sums = new Map<string, { sum: number; n: number }>();
    for (const [key, v] of best) {
      const sid = key.split(':')[1]!;
      if (!v.maxScore) continue;
      const pct = (v.score / v.maxScore) * 100;
      const s = sums.get(sid) ?? { sum: 0, n: 0 };
      s.sum += pct;
      s.n += 1;
      sums.set(sid, s);
    }
    for (const sid of studentIds) {
      const s = sums.get(sid);
      quizAvgByStudent.set(sid, s ? s.sum / s.n : null);
    }
  }

  // Inactivity: last activity time = max(submission.updatedAt, attempt.startedAt, post.createdAt).
  const lastActivityByStudent = new Map<string, string | null>();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  if (courseAssignmentIds.length > 0) {
    const subs = await db
      .select({
        studentId: assignmentSubmissions.studentId,
        updatedAt: assignmentSubmissions.updatedAt,
      })
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, courseAssignmentIds),
          inArray(assignmentSubmissions.studentId, studentIds),
          sql`${assignmentSubmissions.updatedAt} >= ${since}`,
        ),
      );
    for (const s of subs) {
      const prev = lastActivityByStudent.get(s.studentId);
      if (!prev || s.updatedAt > prev) lastActivityByStudent.set(s.studentId, s.updatedAt);
    }
  }
  if (courseQuizIds.length > 0) {
    const attempts = await db
      .select({
        studentId: quizAttempts.studentId,
        startedAt: quizAttempts.startedAt,
      })
      .from(quizAttempts)
      .where(
        and(
          inArray(quizAttempts.quizId, courseQuizIds),
          inArray(quizAttempts.studentId, studentIds),
          sql`${quizAttempts.startedAt} >= ${since}`,
        ),
      );
    for (const a of attempts) {
      const prev = lastActivityByStudent.get(a.studentId);
      if (!prev || a.startedAt > prev) lastActivityByStudent.set(a.studentId, a.startedAt);
    }
  }
  // Discussion posts authored by student in topics belonging to this course.
  const topicRows = await db
    .select({ id: discussionTopics.id })
    .from(discussionTopics)
    .where(eq(discussionTopics.courseId, courseId));
  if (topicRows.length > 0) {
    const topicIds = topicRows.map((t) => t.id);
    const posts = await db
      .select({
        authorId: discussionPosts.authorId,
        createdAt: discussionPosts.createdAt,
      })
      .from(discussionPosts)
      .where(
        and(
          inArray(discussionPosts.topicId, topicIds),
          inArray(discussionPosts.authorId, studentIds),
          sql`${discussionPosts.createdAt} >= ${since}`,
        ),
      );
    for (const p of posts) {
      const prev = lastActivityByStudent.get(p.authorId);
      if (!prev || p.createdAt > prev) lastActivityByStudent.set(p.authorId, p.createdAt);
    }
  }

  // Evaluate rules per student.
  const sevenDaysAgo = new Date(Date.now() - ALERT_RULES.inactivity.days * 24 * 60 * 60 * 1000).toISOString();
  for (const sid of studentIds) {
    // Rule 1 & 2: attendance.
    if (sessionsCount > 0) {
      const recs = recordsByStudent.get(sid) ?? new Map();
      let present = 0;
      for (const status of recs.values()) {
        if (status === 'present' || status === 'late' || status === 'excused') present += 1;
      }
      const rate = present / sessionsCount;
      if (rate < ALERT_RULES.attendance_low.threshold) {
        const created = await upsertOpenAlert(db, {
          userId: sid,
          courseId,
          type: 'attendance_low',
          severity: ALERT_RULES.attendance_low.severity,
          title: `Attendance below ${ALERT_RULES.attendance_low.threshold * 100}% in ${courseTitle}`,
          body: `Attendance rate is ${(rate * 100).toFixed(1)}% (${present}/${sessionsCount}).`,
          metadata: { rate, sessions: sessionsCount, present },
        });
        if (created) {
          result.generated += 1;
          result.byType.attendance_low = (result.byType.attendance_low ?? 0) + 1;
        }
      }
      const statusList = sessionOrder.map((sessId) => recs.get(sessId) ?? 'absent');
      const streak = consecutiveAbsenceStreak(statusList);
      if (streak >= ALERT_RULES.consecutive_absences.threshold) {
        const created = await upsertOpenAlert(db, {
          userId: sid,
          courseId,
          type: 'consecutive_absences',
          severity: ALERT_RULES.consecutive_absences.severity,
          title: `${streak} consecutive absences in ${courseTitle}`,
          body: `Student has ${streak} consecutive absent sessions.`,
          metadata: { streak },
        });
        if (created) {
          result.generated += 1;
          result.byType.consecutive_absences = (result.byType.consecutive_absences ?? 0) + 1;
        }
      }
    }
    // Rule 3: late submissions.
    const lateCount = lateCountByStudent.get(sid) ?? 0;
    if (lateCount >= ALERT_RULES.late_submissions.threshold) {
      const created = await upsertOpenAlert(db, {
        userId: sid,
        courseId,
        type: 'late_submissions',
        severity: ALERT_RULES.late_submissions.severity,
        title: `${lateCount} late submissions in ${courseTitle}`,
        body: `Student has submitted ${lateCount} assignments late.`,
        metadata: { count: lateCount },
      });
      if (created) {
        result.generated += 1;
        result.byType.late_submissions = (result.byType.late_submissions ?? 0) + 1;
      }
    }
    // Rule 4: quiz average low.
    const qavg = quizAvgByStudent.get(sid);
    if (qavg !== null && qavg !== undefined && qavg < ALERT_RULES.quiz_average_low.threshold) {
      const created = await upsertOpenAlert(db, {
        userId: sid,
        courseId,
        type: 'quiz_average_low',
        severity: ALERT_RULES.quiz_average_low.severity,
        title: `Quiz average ${qavg.toFixed(1)}% in ${courseTitle}`,
        body: `Quiz average is below ${ALERT_RULES.quiz_average_low.threshold}%.`,
        metadata: { average: qavg },
      });
      if (created) {
        result.generated += 1;
        result.byType.quiz_average_low = (result.byType.quiz_average_low ?? 0) + 1;
      }
    }
    // Rule 5: inactivity (7d no activity).
    const lastAct = lastActivityByStudent.get(sid) ?? null;
    if (lastAct === null || lastAct < sevenDaysAgo) {
      const created = await upsertOpenAlert(db, {
        userId: sid,
        courseId,
        type: 'inactivity',
        severity: ALERT_RULES.inactivity.severity,
        title: `No activity in ${ALERT_RULES.inactivity.days} days — ${courseTitle}`,
        body: lastAct
          ? `Last activity at ${lastAct}.`
          : `No activity recorded in the past ${ALERT_RULES.inactivity.days} days.`,
        metadata: { lastActivity: lastAct },
      });
      if (created) {
        result.generated += 1;
        result.byType.inactivity = (result.byType.inactivity ?? 0) + 1;
      }
    }
  }
  return result;
}

// Re-export users for tests using the same helper.
void users;
