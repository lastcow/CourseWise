import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  type CategoryScoreBreakdown,
  type FinalGradeSummary,
  type GradingPolicy,
  type GradingPolicySummary,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  discussionGrades,
  discussionTopics,
  enrollments,
  finalGrades,
  quizAttempts,
  quizzes,
  users,
} from '../db/schema';
import { computeLetterGrade, policyToGradingPolicy } from './gradingPolicy';

const FINAL_PROJECT_KEYWORDS = ['final project', 'final_project', 'finalproject', '期末', '结业'];

function isFinalProjectTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return FINAL_PROJECT_KEYWORDS.some((kw) => lower.includes(kw));
}

interface StudentCategoryAggregates {
  attendance: { sessionsCount: number; presentCount: number; rate: number | null };
  assignments: {
    regular: Array<{ score: number; maxScore: number }>;
    average: number | null;
  };
  quizzes: { attempts: Array<{ score: number; maxScore: number }>; average: number | null };
  discussion: { grades: Array<{ score: number; maxScore: number }>; average: number | null };
  finalProject: { items: Array<{ score: number; maxScore: number }>; average: number | null };
}

function emptyAggregates(): StudentCategoryAggregates {
  return {
    attendance: { sessionsCount: 0, presentCount: 0, rate: null },
    assignments: { regular: [], average: null },
    quizzes: { attempts: [], average: null },
    discussion: { grades: [], average: null },
    finalProject: { items: [], average: null },
  };
}

function avgPercent(items: Array<{ score: number; maxScore: number }>): number | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, it) => {
    if (!it.maxScore) return sum;
    return sum + (it.score / it.maxScore) * 100;
  }, 0);
  return total / items.length;
}

export async function aggregateCourseCategoryScores(
  db: Db,
  courseId: string,
  studentIds: string[],
): Promise<Map<string, StudentCategoryAggregates>> {
  const result = new Map<string, StudentCategoryAggregates>();
  for (const id of studentIds) result.set(id, emptyAggregates());

  if (studentIds.length === 0) return result;

  // Attendance: count sessions in course + per-student present/late counts.
  const sessions = await db
    .select({ id: attendanceSessions.id })
    .from(attendanceSessions)
    .where(eq(attendanceSessions.courseId, courseId));
  const sessionCount = sessions.length;
  if (sessionCount > 0) {
    const sessionIds = sessions.map((s) => s.id);
    const recs = await db
      .select({
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .where(
        and(
          inArray(attendanceRecords.sessionId, sessionIds),
          inArray(attendanceRecords.studentId, studentIds),
        ),
      );
    const presentByStudent = new Map<string, number>();
    for (const r of recs) {
      if (r.status === 'present' || r.status === 'late' || r.status === 'excused') {
        presentByStudent.set(r.studentId, (presentByStudent.get(r.studentId) ?? 0) + 1);
      }
    }
    for (const sid of studentIds) {
      const agg = result.get(sid)!;
      const present = presentByStudent.get(sid) ?? 0;
      agg.attendance.sessionsCount = sessionCount;
      agg.attendance.presentCount = present;
      agg.attendance.rate = present / sessionCount;
    }
  }

  // Assignments: split into regular vs final-project by title keyword.
  const courseAssignments = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      maxScore: assignments.maxScore,
    })
    .from(assignments)
    .where(eq(assignments.courseId, courseId));
  const assignmentMap = new Map<
    string,
    { isFinal: boolean; maxScore: number }
  >();
  for (const a of courseAssignments) {
    assignmentMap.set(a.id, {
      isFinal: isFinalProjectTitle(a.title),
      maxScore: a.maxScore !== null ? Number(a.maxScore) : 100,
    });
  }
  if (assignmentMap.size > 0) {
    const subs = await db
      .select({
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        score: assignmentSubmissions.score,
        status: assignmentSubmissions.status,
      })
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, Array.from(assignmentMap.keys())),
          inArray(assignmentSubmissions.studentId, studentIds),
        ),
      );
    for (const s of subs) {
      if (s.score === null) continue;
      const meta = assignmentMap.get(s.assignmentId);
      if (!meta) continue;
      const score = Number(s.score);
      const agg = result.get(s.studentId);
      if (!agg) continue;
      const bucket = meta.isFinal ? agg.finalProject.items : agg.assignments.regular;
      bucket.push({ score, maxScore: meta.maxScore || 100 });
    }
  }

  // Quizzes: use attempts.score / attempts.maxScore (best attempt per quiz per student).
  const courseQuizzes = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(eq(quizzes.courseId, courseId));
  if (courseQuizzes.length > 0) {
    const quizIds = courseQuizzes.map((q) => q.id);
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
          inArray(quizAttempts.quizId, quizIds),
          inArray(quizAttempts.studentId, studentIds),
        ),
      );
    const bestByQuizStudent = new Map<string, { score: number; maxScore: number }>();
    for (const a of attempts) {
      if (a.status !== 'submitted' && a.status !== 'expired') continue;
      if (a.score === null || a.maxScore === null) continue;
      const key = `${a.quizId}:${a.studentId}`;
      const score = Number(a.score);
      const max = Number(a.maxScore);
      const prev = bestByQuizStudent.get(key);
      if (!prev || score > prev.score) {
        bestByQuizStudent.set(key, { score, maxScore: max });
      }
    }
    for (const [key, val] of bestByQuizStudent) {
      const studentId = key.split(':')[1];
      const agg = result.get(studentId!);
      if (!agg) continue;
      if (!val.maxScore) continue;
      agg.quizzes.attempts.push(val);
    }
  }

  // Discussion: average of graded discussion topic scores.
  const topics = await db
    .select({ id: discussionTopics.id, maxScore: discussionTopics.maxScore })
    .from(discussionTopics)
    .where(
      and(eq(discussionTopics.courseId, courseId), eq(discussionTopics.isGraded, true)),
    );
  if (topics.length > 0) {
    const topicIds = topics.map((t) => t.id);
    const topicMax = new Map<string, number>();
    for (const t of topics) {
      topicMax.set(t.id, t.maxScore !== null ? Number(t.maxScore) : 100);
    }
    const grades = await db
      .select({
        topicId: discussionGrades.topicId,
        studentId: discussionGrades.studentId,
        score: discussionGrades.score,
      })
      .from(discussionGrades)
      .where(
        and(
          inArray(discussionGrades.topicId, topicIds),
          inArray(discussionGrades.studentId, studentIds),
        ),
      );
    for (const g of grades) {
      if (g.score === null) continue;
      const max = topicMax.get(g.topicId) ?? 100;
      const agg = result.get(g.studentId);
      if (!agg || !max) continue;
      agg.discussion.grades.push({ score: Number(g.score), maxScore: max });
    }
  }

  // Finalize averages.
  for (const sid of studentIds) {
    const agg = result.get(sid)!;
    agg.assignments.average = avgPercent(agg.assignments.regular);
    agg.quizzes.average = avgPercent(agg.quizzes.attempts);
    agg.discussion.average = avgPercent(agg.discussion.grades);
    agg.finalProject.average = avgPercent(agg.finalProject.items);
  }
  return result;
}

export function computeWeightedScore(
  agg: StudentCategoryAggregates,
  policy: GradingPolicy,
): { score: number; breakdown: CategoryScoreBreakdown } {
  const cats: Array<{
    key: keyof CategoryScoreBreakdown;
    weight: number;
    raw: number | null;
    detail?: Record<string, number | string | null>;
  }> = [
    {
      key: 'attendance',
      weight: policy.attendance,
      raw: agg.attendance.rate !== null ? agg.attendance.rate * 100 : null,
      detail: {
        sessions: agg.attendance.sessionsCount,
        attended: agg.attendance.presentCount,
      },
    },
    {
      key: 'assignments',
      weight: policy.assignments,
      raw: agg.assignments.average,
      detail: { graded: agg.assignments.regular.length },
    },
    {
      key: 'quizzes',
      weight: policy.quizzes,
      raw: agg.quizzes.average,
      detail: { attempts: agg.quizzes.attempts.length },
    },
    {
      key: 'discussion',
      weight: policy.discussion,
      raw: agg.discussion.average,
      detail: { graded: agg.discussion.grades.length },
    },
    {
      key: 'finalProject',
      weight: policy.finalProject,
      raw: agg.finalProject.average,
      detail: { graded: agg.finalProject.items.length },
    },
  ];
  // Skip categories whose weight is 0; if they have no raw score either, redistribute
  // the missing weight proportionally so the score stays comparable for partial terms.
  const present = cats.filter((c) => c.weight > 0 && c.raw !== null);
  const presentWeight = present.reduce((sum, c) => sum + c.weight, 0);
  let score = 0;
  if (presentWeight > 0) {
    for (const c of present) {
      score += (c.raw! * c.weight) / presentWeight;
    }
  }
  const breakdown = {} as CategoryScoreBreakdown;
  for (const c of cats) {
    breakdown[c.key] = {
      raw: c.raw,
      weight: c.weight,
      weighted: c.raw !== null ? (c.raw * c.weight) / 100 : 0,
      detail: c.detail,
    };
  }
  return { score, breakdown };
}

export function toFinalGradeSummary(
  row: typeof finalGrades.$inferSelect,
  extra?: { studentName?: string; studentEmail?: string },
): FinalGradeSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    studentName: extra?.studentName,
    studentEmail: extra?.studentEmail,
    score: row.score !== null ? Number(row.score) : null,
    letterGrade: row.letterGrade ?? null,
    categoryScores: (row.categoryScores ?? null) as CategoryScoreBreakdown | null,
    gradingPolicySnapshot: (row.gradingPolicySnapshot ?? null) as GradingPolicy | null,
    isOutdated: row.isOutdated,
    teacherOverrideScore:
      row.teacherOverrideScore !== null ? Number(row.teacherOverrideScore) : null,
    teacherOverrideReason: row.teacherOverrideReason ?? null,
    finalizedAt: row.finalizedAt ?? null,
    finalizedById: row.finalizedById ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function recalculateFinalGrades(
  db: Db,
  courseId: string,
  policy: GradingPolicySummary,
  finalizedById: string,
): Promise<{ updated: number; rows: FinalGradeSummary[] }> {
  const enrolled = await db
    .select({
      studentId: enrollments.studentId,
      name: users.name,
      email: users.email,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.studentId, users.id))
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')));
  const studentIds = enrolled.map((e) => e.studentId);
  const aggregates = await aggregateCourseCategoryScores(db, courseId, studentIds);
  const gradingPolicy = policyToGradingPolicy(policy);
  const now = new Date().toISOString();
  const summaries: FinalGradeSummary[] = [];
  for (const e of enrolled) {
    const agg = aggregates.get(e.studentId)!;
    const { score, breakdown } = computeWeightedScore(agg, gradingPolicy);
    const rounded = Math.round(score * 100) / 100;
    // Look up existing row to preserve teacher override.
    const [existing] = await db
      .select()
      .from(finalGrades)
      .where(
        and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, e.studentId)),
      )
      .limit(1);
    const overrideScore =
      existing?.teacherOverrideScore !== null && existing?.teacherOverrideScore !== undefined
        ? Number(existing.teacherOverrideScore)
        : null;
    const effective = overrideScore ?? rounded;
    const letter = computeLetterGrade(effective, policy.letters);
    const values = {
      courseId,
      studentId: e.studentId,
      score: rounded.toFixed(2),
      letterGrade: letter,
      categoryScores: breakdown,
      gradingPolicySnapshot: gradingPolicy,
      isOutdated: false,
      finalizedAt: now,
      finalizedById,
      updatedAt: now,
    };
    let row: typeof finalGrades.$inferSelect | undefined;
    if (existing) {
      [row] = await db
        .update(finalGrades)
        .set(values)
        .where(eq(finalGrades.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(finalGrades).values(values).returning();
    }
    if (row) summaries.push(toFinalGradeSummary(row, { studentName: e.name, studentEmail: e.email }));
  }
  return { updated: summaries.length, rows: summaries };
}

export async function applyTeacherOverride(
  db: Db,
  finalGradeId: string,
  policy: GradingPolicySummary,
  overrideScore: number | null,
  reason: string | null,
  finalizedById: string,
): Promise<FinalGradeSummary | null> {
  const [existing] = await db
    .select()
    .from(finalGrades)
    .where(eq(finalGrades.id, finalGradeId))
    .limit(1);
  if (!existing) return null;
  const baseScore = existing.score !== null ? Number(existing.score) : 0;
  const effective = overrideScore ?? baseScore;
  const letter = computeLetterGrade(effective, policy.letters);
  const now = new Date().toISOString();
  const [updated] = await db
    .update(finalGrades)
    .set({
      teacherOverrideScore: overrideScore !== null ? overrideScore.toFixed(2) : null,
      teacherOverrideReason: reason,
      letterGrade: letter,
      finalizedById,
      finalizedAt: now,
      updatedAt: now,
    })
    .where(eq(finalGrades.id, finalGradeId))
    .returning();
  return updated ? toFinalGradeSummary(updated) : null;
}

// Lightweight helper used by alerts service: per-student percent attendance.
export async function attendanceRateByStudent(
  db: Db,
  courseId: string,
  studentIds: string[],
): Promise<Map<string, { rate: number; sessions: number; present: number } | null>> {
  const out = new Map<string, { rate: number; sessions: number; present: number } | null>();
  for (const id of studentIds) out.set(id, null);
  const sessions = await db
    .select({ id: attendanceSessions.id })
    .from(attendanceSessions)
    .where(eq(attendanceSessions.courseId, courseId));
  if (sessions.length === 0) return out;
  const sessionIds = sessions.map((s) => s.id);
  const recs = await db
    .select({
      studentId: attendanceRecords.studentId,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .where(
      and(
        inArray(attendanceRecords.sessionId, sessionIds),
        inArray(attendanceRecords.studentId, studentIds),
      ),
    );
  const present = new Map<string, number>();
  for (const r of recs) {
    if (r.status === 'present' || r.status === 'late' || r.status === 'excused') {
      present.set(r.studentId, (present.get(r.studentId) ?? 0) + 1);
    }
  }
  for (const sid of studentIds) {
    const p = present.get(sid) ?? 0;
    out.set(sid, { rate: p / sessions.length, sessions: sessions.length, present: p });
  }
  return out;
}

// Sort helper exposed for tests / route filters.
export { isFinalProjectTitle };

// keep sql import referenced (alerts service uses it).
void sql;
