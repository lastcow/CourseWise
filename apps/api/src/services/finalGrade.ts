import { and, asc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import {
  type FinalGradeSummary,
  type GradebookAssignmentItem,
  type GradebookAttendanceItem,
  type GradebookCategoryRollup,
  type GradebookDiscussionItem,
  type GradebookQuizItem,
  type GradebookStudentDetail,
  type GradingPolicySummary,
  type GroupScoreBreakdown,
  type GroupScoreItem,
  type LetterGradeThreshold,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  assignmentGroups,
  assignmentSets,
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
import { computeLetterGrade } from './gradingPolicy';

// ---------------------------------------------------------------------------
// "Posted" gate. A gradable item (assignment / quiz / discussion) counts
// toward the final grade — and shows up in the gradebook — only once it has
// been *posted*: it is no longer a draft AND its start date, if one is set,
// has already arrived. Items the teacher hasn't released yet (drafts) or has
// scheduled for the future never dilute the grade or the per-category "X of Y
// graded" progress, so the score reflects only work that has actually been
// made available to students. Closed/archived items stay in — they were posted
// and had their window. This mirrors the student-visibility + start-window
// gates enforced in routes/assignments.ts and routes/quizzes.ts.
//
// Discussions have no start field, so `startAt` is null and the rule collapses
// to "not a draft".
export function isItemPosted(
  item: { status: string; startAt: string | null },
  now: number = Date.now(),
): boolean {
  if (item.status === 'draft') return false;
  if (item.startAt && Date.parse(item.startAt) > now) return false;
  return true;
}

// An attendance session counts toward the attendance rate only once it has
// *started* (its sessionDate has arrived). Sessions the teacher has scheduled
// for the future are not yet markable, so including them would dilute the rate
// (e.g. present at all 4 held sessions would read 4/10 if 6 future sessions
// were counted). They are excluded from both the computed rate and the
// gradebook's session list until they start.
export function isSessionStarted(sessionDate: string, now: number = Date.now()): boolean {
  return Date.parse(sessionDate) <= now;
}

// ---------------------------------------------------------------------------
// Pure scoring algorithm. Lives at the top so it can be unit-tested without a
// database. `summarizeFinalGrade` and the route-facing helpers assemble the
// input shape from Drizzle and delegate to this function.
// ---------------------------------------------------------------------------

interface ComputeFinalScoreInput {
  groups: Array<{
    id: string;
    name: string;
    weight: number;
    items: Array<{
      id: string;
      type: 'assignment' | 'quiz' | 'discussion' | 'set';
      title: string;
      score: number | null;
      max: number;
      // Only for type 'set': the member assignments behind the rolled-up score.
      members?: GroupScoreItem[];
    }>;
  }>;
  attendance: { rate: number | null; weight: number };
}

interface ComputeFinalScoreResult {
  score: number | null;
  groups: GroupScoreBreakdown[];
  attendance: { rate: number; weight: number; weighted: number } | null;
}

// Roll a set's member percentages up to a single percentage per its rule.
// `average` = mean of the scored members; `highest` = best-of. Returns null
// when no member is scored (the set then drops out of its category).
export function rollUpSetScore(
  rule: 'average' | 'highest',
  memberPercents: number[],
): number | null {
  if (memberPercents.length === 0) return null;
  return rule === 'highest'
    ? Math.max(...memberPercents)
    : memberPercents.reduce((acc, p) => acc + p, 0) / memberPercents.length;
}

export function computeFinalScore(input: ComputeFinalScoreInput): ComputeFinalScoreResult {
  const attendanceWeight = input.attendance.weight;

  // Stage 1: build a per-group raw score (mean of item percentages) + breakdown skeleton.
  const groups: GroupScoreBreakdown[] = input.groups.map((g) => {
    const scoredItems = g.items.filter((i) => i.score !== null && i.max > 0);
    const raw =
      scoredItems.length > 0
        ? scoredItems.reduce((acc, i) => acc + (i.score! / i.max) * 100, 0) / scoredItems.length
        : null;
    return {
      groupId: g.id,
      groupName: g.name,
      weight: g.weight,
      itemCount: g.items.length,
      itemsScored: scoredItems.length,
      raw,
      weighted: 0,
      detail: g.items.map((i) => ({
        itemId: i.id,
        itemType: i.type,
        title: i.title,
        score: i.score,
        max: i.max,
        ...(i.members ? { members: i.members } : {}),
      })),
    };
  });

  // Stage 2: attendance + groups all live in one weighted pool that sums to 100.
  // Each bucket's `weighted` contribution is `(raw × weight) / 100` directly.
  // Empty buckets (no data) drop out and the remaining buckets are renormalized
  // over the still-usable weight, so a course missing one bucket still produces
  // a meaningful score from the rest.
  const attendanceUsable = input.attendance.rate !== null && attendanceWeight > 0;
  const attendance = attendanceUsable
    ? {
        rate: input.attendance.rate!,
        weight: attendanceWeight,
        weighted: (input.attendance.rate! * attendanceWeight) / 100,
      }
    : null;

  const usableGroups = groups.filter((g) => g.raw !== null);
  let totalUsableWeight = usableGroups.reduce((acc, g) => acc + g.weight, 0);
  if (attendanceUsable) totalUsableWeight += attendanceWeight;

  let score: number | null;
  if (totalUsableWeight === 0) {
    score = null;
  } else {
    const groupsContribution = usableGroups.reduce((acc, g) => acc + g.raw! * g.weight, 0);
    const attendanceContribution = attendanceUsable
      ? input.attendance.rate! * attendanceWeight
      : 0;
    score = (groupsContribution + attendanceContribution) / totalUsableWeight;
  }

  // Stage 3: per-group `weighted` is the bucket's nominal contribution to a
  // 100-summing total (raw × weight / 100). When everything is balanced this
  // matches the final score; when some buckets are missing, the renormalization
  // above scales the final score up so the visible per-bucket values still
  // reflect each bucket's *nominal* share of the gradebook.
  for (const g of groups) {
    g.weighted = g.raw === null ? 0 : (g.raw * g.weight) / 100;
  }

  return { score, groups, attendance };
}

// ---------------------------------------------------------------------------
// DB → algorithm input adapters. These walk the assignment_groups table and
// the per-item tables (assignments, quizzes, discussion_topics) to build the
// `ComputeFinalScoreInput.groups[]` shape, then merge in the student's scores.
// ---------------------------------------------------------------------------

interface CourseGroupDef {
  id: string;
  name: string;
  weight: number;
  position: number;
  assignmentIds: string[];
  quizIds: string[];
  discussionIds: string[];
}

// An assignment set rolls its member assignments up to one score (per `rule`)
// that counts as a single item inside the category named by `groupId`.
interface CourseSetDef {
  id: string;
  name: string;
  rule: 'average' | 'highest';
  groupId: string | null;
  memberIds: string[];
}

interface CourseGradingContext {
  groups: CourseGroupDef[];
  sets: CourseSetDef[];
  assignmentMeta: Map<string, { groupId: string; title: string; maxScore: number }>;
  quizMeta: Map<string, { groupId: string; title: string; maxScore: number }>;
  discussionMeta: Map<string, { groupId: string; title: string; maxScore: number }>;
  attendanceSessionIds: string[];
}

async function loadCourseGradingContext(
  db: Db,
  courseId: string,
): Promise<CourseGradingContext> {
  const groupRows = await db
    .select()
    .from(assignmentGroups)
    .where(eq(assignmentGroups.courseId, courseId))
    .orderBy(asc(assignmentGroups.position));

  const groups: CourseGroupDef[] = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    weight: g.weight,
    position: g.position,
    assignmentIds: [],
    quizIds: [],
    discussionIds: [],
  }));
  const groupIndex = new Map(groups.map((g) => [g.id, g]));

  // Assignment sets for this course (each rolls up to one item in its category).
  const setRows = await db
    .select()
    .from(assignmentSets)
    .where(eq(assignmentSets.courseId, courseId))
    .orderBy(asc(assignmentSets.position));
  const sets: CourseSetDef[] = setRows.map((s) => ({
    id: s.id,
    name: s.name,
    rule: s.scoringRule,
    groupId: s.groupId,
    memberIds: [],
  }));
  const setIndex = new Map(sets.map((s) => [s.id, s]));

  const assignmentMeta = new Map<string, { groupId: string; title: string; maxScore: number }>();
  const quizMeta = new Map<string, { groupId: string; title: string; maxScore: number }>();
  const discussionMeta = new Map<string, { groupId: string; title: string; maxScore: number }>();

  const now = Date.now();

  if (groups.length > 0) {
    // Pull assignments that belong either directly to a category (groupId) or to
    // a set (setId). Set members are routed to their set (and excluded from the
    // category's direct items) so they contribute only via the rolled-up score.
    const assignRows = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        maxScore: assignments.maxScore,
        groupId: assignments.groupId,
        setId: assignments.setId,
        status: assignments.status,
        startDate: assignments.startDate,
      })
      .from(assignments)
      .where(
        and(
          eq(assignments.courseId, courseId),
          or(isNotNull(assignments.groupId), isNotNull(assignments.setId)),
        ),
      );
    for (const a of assignRows) {
      if (!isItemPosted({ status: a.status, startAt: a.startDate }, now)) continue;
      // setId takes precedence over a direct groupId.
      const set = a.setId ? setIndex.get(a.setId) : undefined;
      if (set) {
        set.memberIds.push(a.id);
        assignmentMeta.set(a.id, {
          groupId: set.groupId ?? '',
          title: a.title,
          maxScore: a.maxScore !== null ? Number(a.maxScore) : 100,
        });
        continue;
      }
      if (!a.groupId) continue;
      const g = groupIndex.get(a.groupId);
      if (!g) continue;
      g.assignmentIds.push(a.id);
      assignmentMeta.set(a.id, {
        groupId: a.groupId,
        title: a.title,
        maxScore: a.maxScore !== null ? Number(a.maxScore) : 100,
      });
    }

    const quizRows = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        maxScore: quizzes.maxScore,
        groupId: quizzes.groupId,
        status: quizzes.status,
        startTime: quizzes.startTime,
      })
      .from(quizzes)
      .where(and(eq(quizzes.courseId, courseId), isNotNull(quizzes.groupId)));
    for (const q of quizRows) {
      if (!q.groupId) continue;
      if (!isItemPosted({ status: q.status, startAt: q.startTime }, now)) continue;
      const g = groupIndex.get(q.groupId);
      if (!g) continue;
      g.quizIds.push(q.id);
      quizMeta.set(q.id, {
        groupId: q.groupId,
        title: q.title,
        maxScore: q.maxScore !== null ? Number(q.maxScore) : 100,
      });
    }

    const topicRows = await db
      .select({
        id: discussionTopics.id,
        title: discussionTopics.title,
        maxScore: discussionTopics.maxScore,
        groupId: discussionTopics.groupId,
        isGraded: discussionTopics.isGraded,
        status: discussionTopics.status,
      })
      .from(discussionTopics)
      .where(
        and(
          eq(discussionTopics.courseId, courseId),
          eq(discussionTopics.isGraded, true),
          isNotNull(discussionTopics.groupId),
        ),
      );
    for (const t of topicRows) {
      if (!t.groupId) continue;
      if (!isItemPosted({ status: t.status, startAt: null }, now)) continue;
      const g = groupIndex.get(t.groupId);
      if (!g) continue;
      g.discussionIds.push(t.id);
      discussionMeta.set(t.id, {
        groupId: t.groupId,
        title: t.title,
        maxScore: t.maxScore !== null ? Number(t.maxScore) : 100,
      });
    }
  }

  const sessionRows = (
    await db
      .select({ id: attendanceSessions.id, sessionDate: attendanceSessions.sessionDate })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseId))
  ).filter((s) => isSessionStarted(s.sessionDate, now));

  return {
    groups,
    sets,
    assignmentMeta,
    quizMeta,
    discussionMeta,
    attendanceSessionIds: sessionRows.map((s) => s.id),
  };
}

interface StudentItemScores {
  assignment: Map<string, number>; // assignmentId → score
  quiz: Map<string, { score: number; maxScore: number }>; // quizId → best attempt
  discussion: Map<string, number>; // topicId → score
  attendance: { sessionsCount: number; presentCount: number; rate: number | null };
}

function emptyStudentScores(): StudentItemScores {
  return {
    assignment: new Map(),
    quiz: new Map(),
    discussion: new Map(),
    attendance: { sessionsCount: 0, presentCount: 0, rate: null },
  };
}

async function loadStudentItemScores(
  db: Db,
  ctx: CourseGradingContext,
  studentIds: string[],
): Promise<Map<string, StudentItemScores>> {
  const result = new Map<string, StudentItemScores>();
  for (const id of studentIds) result.set(id, emptyStudentScores());
  if (studentIds.length === 0) return result;

  // Attendance.
  const sessionCount = ctx.attendanceSessionIds.length;
  if (sessionCount > 0) {
    const recs = await db
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(
        and(
          inArray(attendanceRecords.sessionId, ctx.attendanceSessionIds),
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
      const s = result.get(sid)!;
      const present = presentByStudent.get(sid) ?? 0;
      s.attendance.sessionsCount = sessionCount;
      s.attendance.presentCount = present;
      s.attendance.rate = (present / sessionCount) * 100;
    }
  }

  // Assignment submissions.
  const assignmentIds = Array.from(ctx.assignmentMeta.keys());
  if (assignmentIds.length > 0) {
    const subs = await db
      .select({
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        score: assignmentSubmissions.score,
      })
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, assignmentIds),
          inArray(assignmentSubmissions.studentId, studentIds),
        ),
      );
    for (const s of subs) {
      if (s.score === null) continue;
      const bucket = result.get(s.studentId);
      if (!bucket) continue;
      bucket.assignment.set(s.assignmentId, Number(s.score));
    }
  }

  // Quiz attempts — pick best per (quiz, student).
  const quizIds = Array.from(ctx.quizMeta.keys());
  if (quizIds.length > 0) {
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
    for (const a of attempts) {
      if (a.status !== 'submitted' && a.status !== 'expired') continue;
      if (a.score === null || a.maxScore === null) continue;
      const bucket = result.get(a.studentId);
      if (!bucket) continue;
      const score = Number(a.score);
      const maxScore = Number(a.maxScore);
      const prev = bucket.quiz.get(a.quizId);
      if (!prev || score > prev.score) {
        bucket.quiz.set(a.quizId, { score, maxScore });
      }
    }
  }

  // Discussion grades.
  const topicIds = Array.from(ctx.discussionMeta.keys());
  if (topicIds.length > 0) {
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
      const bucket = result.get(g.studentId);
      if (!bucket) continue;
      bucket.discussion.set(g.topicId, Number(g.score));
    }
  }

  return result;
}

function buildAlgorithmInput(
  ctx: CourseGradingContext,
  studentScores: StudentItemScores,
  attendanceWeight: number,
): ComputeFinalScoreInput {
  const groups: ComputeFinalScoreInput['groups'] = ctx.groups.map((g) => ({
    id: g.id,
    name: g.name,
    weight: g.weight,
    items: [
      ...g.assignmentIds.map((aid) => {
        const meta = ctx.assignmentMeta.get(aid)!;
        const score = studentScores.assignment.get(aid);
        return {
          id: aid,
          type: 'assignment' as const,
          title: meta.title,
          score: score !== undefined ? score : null,
          max: meta.maxScore || 100,
        };
      }),
      ...g.quizIds.map((qid) => {
        const meta = ctx.quizMeta.get(qid)!;
        const attempt = studentScores.quiz.get(qid);
        return {
          id: qid,
          type: 'quiz' as const,
          title: meta.title,
          score: attempt ? attempt.score : null,
          // Prefer the attempt's maxScore (it's the source of truth for that
          // attempt's possible points); fall back to the quiz's configured max.
          max: attempt ? attempt.maxScore || meta.maxScore || 100 : meta.maxScore || 100,
        };
      }),
      ...g.discussionIds.map((did) => {
        const meta = ctx.discussionMeta.get(did)!;
        const score = studentScores.discussion.get(did);
        return {
          id: did,
          type: 'discussion' as const,
          title: meta.title,
          score: score !== undefined ? score : null,
          max: meta.maxScore || 100,
        };
      }),
    ],
  }));

  // Append each set as ONE rolled-up item inside its category. The set's score
  // is the average or best-of its scored members' percentages (members may have
  // different maxScores, so we roll up on percentages); null if none scored, so
  // it drops out of the category just like any unscored item.
  const groupById = new Map(groups.map((g) => [g.id, g]));
  for (const set of ctx.sets) {
    if (!set.groupId) continue;
    const target = groupById.get(set.groupId);
    if (!target) continue;
    const members: GroupScoreItem[] = set.memberIds.map((mid) => {
      const meta = ctx.assignmentMeta.get(mid)!;
      const score = studentScores.assignment.get(mid);
      return {
        itemId: mid,
        itemType: 'assignment',
        title: meta.title,
        score: score !== undefined ? score : null,
        max: meta.maxScore || 100,
      };
    });
    const percents = members
      .filter((m) => m.score !== null && m.max > 0)
      .map((m) => (m.score! / m.max) * 100);
    const rolled = rollUpSetScore(set.rule, percents);
    target.items.push({
      id: set.id,
      type: 'set',
      title: set.name,
      score: rolled,
      max: 100,
      members,
    });
  }

  return {
    groups,
    attendance: { rate: studentScores.attendance.rate, weight: attendanceWeight },
  };
}

// ---------------------------------------------------------------------------
// Persistence + serialization
// ---------------------------------------------------------------------------

function buildPolicySnapshot(
  policy: GradingPolicySummary,
  ctx: CourseGradingContext,
): FinalGradeSummary['gradingPolicySnapshot'] {
  return {
    attendanceWeight: policy.weightAttendance,
    groups: ctx.groups.map((g) => ({ id: g.id, name: g.name, weight: g.weight })),
    letters: policy.letters,
  };
}

export function toFinalGradeSummary(
  row: typeof finalGrades.$inferSelect,
  extra?: { studentName?: string; studentEmail?: string },
): FinalGradeSummary {
  const rawCategory = row.categoryScores;
  let groups: GroupScoreBreakdown[] = [];
  let attendance: FinalGradeSummary['attendance'] = null;
  if (rawCategory && typeof rawCategory === 'object' && !Array.isArray(rawCategory)) {
    const cs = rawCategory as { groups?: unknown; attendance?: unknown };
    if (Array.isArray(cs.groups)) groups = cs.groups as GroupScoreBreakdown[];
    if (
      cs.attendance &&
      typeof cs.attendance === 'object' &&
      cs.attendance !== null
    ) {
      attendance = cs.attendance as FinalGradeSummary['attendance'];
    }
  }
  return {
    id: row.id,
    courseId: row.courseId,
    studentId: row.studentId,
    studentName: extra?.studentName,
    studentEmail: extra?.studentEmail,
    score: row.score !== null ? Number(row.score) : null,
    letterGrade: row.letterGrade ?? null,
    groups,
    attendance,
    gradingPolicySnapshot:
      (row.gradingPolicySnapshot as FinalGradeSummary['gradingPolicySnapshot']) ?? null,
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
  const ctx = await loadCourseGradingContext(db, courseId);
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
  const scoresByStudent = await loadStudentItemScores(db, ctx, studentIds);
  const snapshot = buildPolicySnapshot(policy, ctx);
  const now = new Date().toISOString();
  const summaries: FinalGradeSummary[] = [];
  for (const e of enrolled) {
    const studentScores = scoresByStudent.get(e.studentId)!;
    const input = buildAlgorithmInput(ctx, studentScores, policy.weightAttendance);
    const computed = computeFinalScore(input);
    const rounded = computed.score !== null ? Math.round(computed.score * 100) / 100 : null;
    // Preserve teacher override.
    const [existing] = await db
      .select()
      .from(finalGrades)
      .where(and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, e.studentId)))
      .limit(1);
    const overrideScore =
      existing?.teacherOverrideScore !== null && existing?.teacherOverrideScore !== undefined
        ? Number(existing.teacherOverrideScore)
        : null;
    const effective = overrideScore ?? rounded ?? 0;
    const letter = computeLetterGrade(effective, policy.letters);
    const values = {
      courseId,
      studentId: e.studentId,
      score: rounded !== null ? rounded.toFixed(2) : null,
      letterGrade: letter,
      categoryScores: { groups: computed.groups, attendance: computed.attendance },
      gradingPolicySnapshot: snapshot,
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
    if (row) {
      summaries.push(toFinalGradeSummary(row, { studentName: e.name, studentEmail: e.email }));
    }
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

// ---------------------------------------------------------------------------
// Gradebook student detail.
//
// Returns `GradebookStudentDetail` — the teacher gradebook page consumes
// `finalGrade.groups[]` for per-group structure and pools the per-item lists
// here (attendance / assignments / quizzes / discussion items) for inline
// editing. The legacy 5-category rollup fields are kept on the response shape
// for compatibility but are now inert (zero-filled); they're no longer
// rendered by any UI.
// ---------------------------------------------------------------------------

const EMPTY_ROLLUP: GradebookCategoryRollup = { raw: null, weight: 0, weighted: 0 };

export async function buildGradebookStudentDetail(
  db: Db,
  courseId: string,
  studentId: string,
  policy: GradingPolicySummary,
): Promise<GradebookStudentDetail | null> {
  const [enrollment] = await db
    .select({
      studentId: enrollments.studentId,
      name: users.name,
      email: users.email,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.studentId, users.id))
    .where(
      and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.studentId, studentId),
        eq(enrollments.status, 'enrolled'),
      ),
    )
    .limit(1);
  if (!enrollment) return null;

  // Only posted items (published + started) appear in the gradebook, matching
  // what counts toward the final grade. See isItemPosted.
  const now = Date.now();

  // Attendance items (every session in the course, joined to the student's record).
  const sessions = (
    await db
      .select({
        id: attendanceSessions.id,
        title: attendanceSessions.title,
        sessionDate: attendanceSessions.sessionDate,
      })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, courseId))
      .orderBy(asc(attendanceSessions.sessionDate))
  ).filter((s) => isSessionStarted(s.sessionDate, now));
  const recs = sessions.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            inArray(
              attendanceRecords.sessionId,
              sessions.map((s) => s.id),
            ),
            eq(attendanceRecords.studentId, studentId),
          ),
        )
    : [];
  const recBySession = new Map(recs.map((r) => [r.sessionId, r]));
  const attendanceItems: GradebookAttendanceItem[] = sessions.map((s) => {
    const r = recBySession.get(s.id);
    return {
      sessionId: s.id,
      recordId: r?.id ?? null,
      title: s.title,
      sessionDate: s.sessionDate,
      status: r?.status ?? null,
      notes: r?.notes ?? null,
    };
  });

  // Every published assignment in the course (incl. those not yet in a group),
  // joined to the student's submission.
  const courseAssignments = (
    await db
      .select({
        id: assignments.id,
        title: assignments.title,
        maxScore: assignments.maxScore,
        status: assignments.status,
        startDate: assignments.startDate,
      })
      .from(assignments)
      .where(eq(assignments.courseId, courseId))
      .orderBy(asc(assignments.title))
  ).filter((a) => isItemPosted({ status: a.status, startAt: a.startDate }, now));
  const subs = courseAssignments.length
    ? await db
        .select()
        .from(assignmentSubmissions)
        .where(
          and(
            inArray(
              assignmentSubmissions.assignmentId,
              courseAssignments.map((a) => a.id),
            ),
            eq(assignmentSubmissions.studentId, studentId),
          ),
        )
    : [];
  const subByAssignment = new Map(subs.map((s) => [s.assignmentId, s]));
  const assignmentItems: GradebookAssignmentItem[] = [];
  for (const a of courseAssignments) {
    const sub = subByAssignment.get(a.id);
    assignmentItems.push({
      assignmentId: a.id,
      submissionId: sub?.id ?? null,
      title: a.title,
      maxScore: a.maxScore !== null ? Number(a.maxScore) : 100,
      score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : null,
      status: sub?.status ?? null,
      feedback: sub?.feedback ?? null,
      isFinalProject: false,
      gradedAt: sub?.gradedAt ?? null,
    });
  }

  // Quizzes in the course + the student's best (or latest) attempt per quiz.
  const courseQuizzes = (
    await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        maxScore: quizzes.maxScore,
        status: quizzes.status,
        startTime: quizzes.startTime,
      })
      .from(quizzes)
      .where(eq(quizzes.courseId, courseId))
      .orderBy(asc(quizzes.title))
  ).filter((q) => isItemPosted({ status: q.status, startAt: q.startTime }, now));
  const attempts = courseQuizzes.length
    ? await db
        .select()
        .from(quizAttempts)
        .where(
          and(
            inArray(
              quizAttempts.quizId,
              courseQuizzes.map((q) => q.id),
            ),
            eq(quizAttempts.studentId, studentId),
          ),
        )
    : [];
  const bestByQuiz = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const prev = bestByQuiz.get(a.quizId);
    const aScore = a.score !== null ? Number(a.score) : -1;
    const prevScore = prev?.score !== null && prev?.score !== undefined ? Number(prev.score) : -1;
    if (!prev || aScore > prevScore) bestByQuiz.set(a.quizId, a);
  }
  const quizItems: GradebookQuizItem[] = [];
  for (const q of courseQuizzes) {
    const a = bestByQuiz.get(q.id);
    quizItems.push({
      quizId: q.id,
      attemptId: a?.id ?? null,
      title: q.title,
      score: a?.score !== null && a?.score !== undefined ? Number(a.score) : null,
      maxScore:
        a?.maxScore !== null && a?.maxScore !== undefined
          ? Number(a.maxScore)
          : q.maxScore !== null
            ? Number(q.maxScore)
            : null,
      status: a?.status ?? null,
      teacherReviewed: a?.teacherReviewed ?? false,
      pendingReviewCount: 0,
    });
  }

  // Discussions: every graded topic in the course + the student's grade.
  const topics = (
    await db
      .select({
        id: discussionTopics.id,
        title: discussionTopics.title,
        maxScore: discussionTopics.maxScore,
        status: discussionTopics.status,
      })
      .from(discussionTopics)
      .where(and(eq(discussionTopics.courseId, courseId), eq(discussionTopics.isGraded, true)))
      .orderBy(asc(discussionTopics.title))
  ).filter((t) => isItemPosted({ status: t.status, startAt: null }, now));
  const grades = topics.length
    ? await db
        .select()
        .from(discussionGrades)
        .where(
          and(
            inArray(
              discussionGrades.topicId,
              topics.map((t) => t.id),
            ),
            eq(discussionGrades.studentId, studentId),
          ),
        )
    : [];
  const gradeByTopic = new Map(grades.map((g) => [g.topicId, g]));
  const discussionItems: GradebookDiscussionItem[] = topics.map((t) => {
    const g = gradeByTopic.get(t.id);
    return {
      topicId: t.id,
      title: t.title,
      maxScore: t.maxScore !== null ? Number(t.maxScore) : 100,
      score: g?.score !== null && g?.score !== undefined ? Number(g.score) : null,
      feedback: g?.feedback ?? null,
      gradedAt: g?.gradedAt ?? null,
    };
  });

  const [finalRow] = await db
    .select()
    .from(finalGrades)
    .where(and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, studentId)))
    .limit(1);

  // Per-group rollups (raw / weight / weighted) live on `finalGrade.groups[]`
  // now. The 5-category rollup fields below are kept for response-shape
  // compatibility but are zero-filled — no UI consumes them.
  return {
    courseId,
    studentId,
    studentName: enrollment.name,
    studentEmail: enrollment.email,
    finalGrade: finalRow ? toFinalGradeSummary(finalRow) : null,
    gradingPolicy: policy,
    attendance: { ...EMPTY_ROLLUP, items: attendanceItems },
    assignments: { ...EMPTY_ROLLUP, items: assignmentItems },
    finalProject: { ...EMPTY_ROLLUP, items: [] },
    quizzes: { ...EMPTY_ROLLUP, items: quizItems },
    discussion: { ...EMPTY_ROLLUP, items: discussionItems },
  };
}

// Lightweight helper used by alerts service: per-student percent attendance.
// (Unchanged from the previous shape — alerts code consumes the raw rate.)
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
    .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
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

// Keep `LetterGradeThreshold` referenced in case downstream consumers re-export
// from this module.
void ({} as LetterGradeThreshold | undefined);
