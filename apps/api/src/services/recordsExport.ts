import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  alerts,
  apiTokens,
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  courses,
  discussionGrades,
  discussionPosts,
  discussionTopics,
  enrollments,
  finalGrades,
  quizAnswers,
  quizAttempts,
  quizzes,
  studentProfiles,
  users,
} from '../db/schema';
import type { DisclosureLogEntry, MyRecordsExport } from '@coursewise/shared';

/**
 * FERPA §99.10(a): every student can inspect/review their own education
 * records on request. This service returns everything in our database where
 * the calling user is the subject.
 *
 * We deliberately do NOT include file contents (assignment uploads,
 * generated .pptx) inline — the export is JSON and embedding multi-MB blobs
 * would blow the response budget. The `fileAssetId` is included so the
 * student can pull each file via the existing presigned-URL flow.
 */
export async function buildMyRecordsExport(db: Db, userId: string): Promise<MyRecordsExport> {
  // Many of these queries are independent; run them in parallel to keep the
  // wall-clock under control. Each is small (single-student scope) so total
  // memory is bounded.
  const [
    userRow,
    profileRow,
    enrollmentRows,
    submissionRows,
    quizAttemptRows,
    attendanceRows,
    discussionPostRows,
    discussionGradeRows,
    finalGradeRows,
    alertRows,
    disclosureRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1),
    db
      .select({
        courseId: enrollments.courseId,
        status: enrollments.status,
        enrolledAt: enrollments.createdAt,
        courseCode: courses.code,
        courseTitle: courses.title,
        termLabel: courses.termLabel,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(eq(enrollments.studentId, userId)),
    db
      .select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        status: assignmentSubmissions.status,
        content: assignmentSubmissions.content,
        fileAssetId: assignmentSubmissions.fileAssetId,
        score: assignmentSubmissions.score,
        feedback: assignmentSubmissions.feedback,
        submittedAt: assignmentSubmissions.submittedAt,
        gradedAt: assignmentSubmissions.gradedAt,
        assignmentTitle: assignments.title,
        courseId: assignments.courseId,
        courseCode: courses.code,
      })
      .from(assignmentSubmissions)
      .innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
      .innerJoin(courses, eq(courses.id, assignments.courseId))
      .where(eq(assignmentSubmissions.studentId, userId)),
    db
      .select({
        id: quizAttempts.id,
        quizId: quizAttempts.quizId,
        status: quizAttempts.status,
        score: quizAttempts.score,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        quizTitle: quizzes.title,
        courseId: quizzes.courseId,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(eq(quizAttempts.studentId, userId)),
    db
      .select({
        sessionId: attendanceRecords.sessionId,
        status: attendanceRecords.status,
        notes: attendanceRecords.notes,
        ipAddress: attendanceRecords.ipAddress,
        recordedAt: attendanceRecords.recordedAt,
        sessionTitle: attendanceSessions.title,
        courseId: attendanceSessions.courseId,
        sessionDate: attendanceSessions.sessionDate,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .where(eq(attendanceRecords.studentId, userId)),
    db
      .select({
        id: discussionPosts.id,
        topicId: discussionPosts.topicId,
        content: discussionPosts.content,
        isDeleted: discussionPosts.isDeleted,
        createdAt: discussionPosts.createdAt,
        topicTitle: discussionTopics.title,
        courseId: discussionTopics.courseId,
      })
      .from(discussionPosts)
      .innerJoin(discussionTopics, eq(discussionTopics.id, discussionPosts.topicId))
      .where(eq(discussionPosts.authorId, userId)),
    db
      .select({
        topicId: discussionGrades.topicId,
        score: discussionGrades.score,
        feedback: discussionGrades.feedback,
        topicTitle: discussionTopics.title,
        courseId: discussionTopics.courseId,
      })
      .from(discussionGrades)
      .innerJoin(discussionTopics, eq(discussionTopics.id, discussionGrades.topicId))
      .where(eq(discussionGrades.studentId, userId)),
    db
      .select({
        courseId: finalGrades.courseId,
        letterGrade: finalGrades.letterGrade,
        score: finalGrades.score,
        teacherOverrideScore: finalGrades.teacherOverrideScore,
        teacherOverrideReason: finalGrades.teacherOverrideReason,
        courseCode: courses.code,
      })
      .from(finalGrades)
      .innerJoin(courses, eq(courses.id, finalGrades.courseId))
      .where(eq(finalGrades.studentId, userId)),
    db
      .select({
        id: alerts.id,
        courseId: alerts.courseId,
        type: alerts.type,
        severity: alerts.severity,
        body: alerts.body,
        createdAt: alerts.createdAt,
      })
      .from(alerts)
      .where(eq(alerts.userId, userId)),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        target: auditLogs.target,
        metadata: auditLogs.metadataJson,
        occurredAt: auditLogs.createdAt,
        actorType: auditLogs.actorType,
        actorName: users.name,
        actorRole: users.role,
        actorTokenName: apiTokens.name,
      })
      .from(auditLogs)
      // Reuse the JOIN pattern from /me/records/disclosures.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .leftJoin(apiTokens, eq(apiTokens.id, auditLogs.actorTokenId))
      .where(eq(auditLogs.disclosedStudentId, userId))
      .orderBy(desc(auditLogs.createdAt)),
  ]);

  const user = userRow[0];
  if (!user) {
    throw new Error(`user ${userId} not found`);
  }
  const profile = profileRow[0] ?? null;

  // Per-attempt answers in one extra query (one IN-list rather than N+1).
  const attemptIds = quizAttemptRows.map((q) => q.id);
  const answerRows = attemptIds.length
    ? await db
        .select({
          attemptId: quizAnswers.attemptId,
          questionId: quizAnswers.questionId,
          answer: quizAnswers.answer,
          isCorrect: quizAnswers.isCorrect,
          pointsAwarded: quizAnswers.pointsAwarded,
        })
        .from(quizAnswers)
        // Re-asserting the student id on the attempt JOIN side prevents a
        // (theoretical) data bug where an answer row points at someone
        // else's attempt from leaking through.
        .innerJoin(
          quizAttempts,
          and(
            eq(quizAttempts.id, quizAnswers.attemptId),
            eq(quizAttempts.studentId, userId),
          ),
        )
    : [];
  const answersByAttempt = new Map<string, typeof answerRows>();
  for (const a of answerRows) {
    const list = answersByAttempt.get(a.attemptId) ?? [];
    list.push(a);
    answersByAttempt.set(a.attemptId, list);
  }

  const disclosures: DisclosureLogEntry[] = disclosureRows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    action: r.action,
    actor: {
      type: r.actorType,
      name: r.actorType === 'api_token' ? r.actorTokenName : r.actorName,
      role:
        r.actorType === 'user' && (r.actorRole === 'admin' || r.actorRole === 'teacher' || r.actorRole === 'student')
          ? r.actorRole
          : null,
    },
    target: r.target,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt ?? null,
      studentNumber: profile?.studentNumber ?? null,
      enrollmentYear: profile?.enrollmentYear ?? null,
    },
    enrollments: enrollmentRows.map((e) => ({
      courseId: e.courseId,
      courseCode: e.courseCode,
      courseTitle: e.courseTitle,
      termLabel: e.termLabel,
      status: e.status,
      enrolledAt: e.enrolledAt,
    })),
    submissions: submissionRows.map((s) => ({
      id: s.id,
      assignmentId: s.assignmentId,
      assignmentTitle: s.assignmentTitle,
      courseId: s.courseId,
      courseCode: s.courseCode,
      status: s.status,
      content: s.content,
      fileAssetId: s.fileAssetId,
      score: s.score,
      feedback: s.feedback,
      submittedAt: s.submittedAt,
      gradedAt: s.gradedAt,
    })),
    quizAttempts: quizAttemptRows.map((q) => ({
      id: q.id,
      quizId: q.quizId,
      quizTitle: q.quizTitle,
      courseId: q.courseId,
      status: q.status,
      score: q.score,
      startedAt: q.startedAt,
      submittedAt: q.submittedAt,
      answers: (answersByAttempt.get(q.id) ?? []).map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
      })),
    })),
    attendance: attendanceRows.map((a) => ({
      sessionId: a.sessionId,
      sessionTitle: a.sessionTitle,
      courseId: a.courseId,
      sessionDate: a.sessionDate,
      status: a.status,
      notes: a.notes,
      ipAddress: a.ipAddress,
      recordedAt: a.recordedAt,
    })),
    discussionPosts: discussionPostRows.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicTitle: p.topicTitle,
      courseId: p.courseId,
      content: p.content,
      isDeleted: p.isDeleted,
      createdAt: p.createdAt,
    })),
    discussionGrades: discussionGradeRows.map((g) => ({
      topicId: g.topicId,
      topicTitle: g.topicTitle,
      courseId: g.courseId,
      score: g.score,
      feedback: g.feedback,
    })),
    finalGrades: finalGradeRows.map((g) => ({
      courseId: g.courseId,
      courseCode: g.courseCode,
      letterGrade: g.letterGrade,
      score: g.score,
      teacherOverrideScore: g.teacherOverrideScore,
      teacherOverrideReason: g.teacherOverrideReason,
    })),
    alerts: alertRows.map((a) => ({
      id: a.id,
      courseId: a.courseId,
      type: a.type,
      severity: a.severity,
      body: a.body,
      createdAt: a.createdAt,
    })),
    disclosures,
  };
}
