import { Hono, type Context } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  addSubmissionAttachmentSchema,
  createAssignmentSchema,
  gradeSubmissionSchema,
  MAX_SUBMISSION_FILES,
  returnSubmissionSchema,
  updateAssignmentSchema,
  updateSubmissionSchema,
  type AddSubmissionAttachmentInput,
  type AssignmentSubmissionsByGroup,
  type AssignmentSummary,
  type CreateAssignmentInput,
  type GradeSubmissionInput,
  type GroupSubmissionWithMembers,
  type MyAssignmentSubmissionResponse,
  type ReturnSubmissionInput,
  type SubmissionAttachment,
  type SubmissionSummary,
  type SubmissionWithStudent,
  type UpdateAssignmentInput,
  type UpdateSubmissionInput,
} from '@coursewise/shared';
import {
  assignmentSubmissions,
  assignments,
  enrollments,
  fileAssets,
  groupMemberships,
  groupSets,
  groupSubmissions,
  groups,
  modules,
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
import {
  ensureGroupSubmissionFannedOut,
  findStudentGroupForAssignment,
} from '../services/groupSubmissions';
import { clampScore, determineSubmissionStatus } from '../services/submissions';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toAssignmentSummary(
  row: typeof assignments.$inferSelect,
  submissionCount?: number,
  ungradedSubmissionCount?: number,
): AssignmentSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    groupId: row.groupId ?? null,
    title: row.title,
    description: row.description ?? null,
    dueDate: row.dueDate ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    untilDate: row.untilDate ?? null,
    maxScore: num(row.maxScore),
    rubric: row.rubric ?? null,
    allowLateSubmission: row.allowLateSubmission,
    attachmentFileId: row.attachmentFileId ?? null,
    status: row.status,
    publishedAt: row.publishedAt ?? null,
    closedAt: row.closedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    position: row.position,
    submissionCount,
    ungradedSubmissionCount,
    submissionMode: row.submissionMode,
    groupSetId: row.groupSetId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSubmissionSummary(
  row: typeof assignmentSubmissions.$inferSelect,
  groupOverride?: { content: string | null; submittedAt: string | null },
  attachments: SubmissionAttachment[] = [],
): SubmissionSummary {
  // For group-mode rows, the canonical content / submittedAt live on
  // group_submissions; we materialize them here so clients can keep using
  // SubmissionSummary uniformly. Attachments are loaded separately (they
  // require a file_assets query) and passed in by the listing endpoints.
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    status: row.status,
    textAnswer: groupOverride ? groupOverride.content : row.content ?? null,
    attachments,
    submittedAt: groupOverride ? groupOverride.submittedAt : row.submittedAt ?? null,
    score: num(row.score),
    feedback: row.feedback ?? null,
    gradedAt: row.gradedAt ?? null,
    gradedById: row.gradedById ?? null,
    groupSubmissionId: row.groupSubmissionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadAssignment(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Assignment not found');
  return row;
}

/**
 * For a submission row that's part of a group submission, fetch the shared
 * group_submissions row so callers can materialize content into the
 * SubmissionSummary response. Returns null for individual submissions.
 */
async function loadGroupSubmissionForRow(
  c: Context<AppEnv>,
  row: typeof assignmentSubmissions.$inferSelect,
) {
  if (!row.groupSubmissionId) return null;
  const db = c.get('db');
  const [gs] = await db
    .select()
    .from(groupSubmissions)
    .where(eq(groupSubmissions.id, row.groupSubmissionId))
    .limit(1);
  return gs ?? null;
}

/**
 * Batch-load a submission's files. Attachments are `file_assets` rows linked
 * via the polymorphic relatedType='submission' + relatedId=<submission row
 * id>; multiple ready files per row means a multi-file submission. Returns a
 * map keyed by relatedId (submission row id), each list ordered oldest-first.
 */
async function loadSubmissionAttachments(
  c: Context<AppEnv>,
  submissionRowIds: string[],
): Promise<Map<string, SubmissionAttachment[]>> {
  const map = new Map<string, SubmissionAttachment[]>();
  if (submissionRowIds.length === 0) return map;
  const db = c.get('db');
  const rows = await db
    .select({
      relatedId: fileAssets.relatedId,
      fileAssetId: fileAssets.id,
      filename: fileAssets.originalFilename,
      sizeBytes: fileAssets.sizeBytes,
      contentType: fileAssets.contentType,
    })
    .from(fileAssets)
    .where(
      and(
        eq(fileAssets.relatedType, 'submission'),
        inArray(fileAssets.relatedId, submissionRowIds),
        eq(fileAssets.status, 'ready'),
      ),
    )
    .orderBy(asc(fileAssets.createdAt));
  for (const row of rows) {
    if (!row.relatedId) continue;
    const list = map.get(row.relatedId) ?? [];
    list.push({
      fileAssetId: row.fileAssetId,
      filename: row.filename ?? null,
      sizeBytes: row.sizeBytes ?? null,
      contentType: row.contentType ?? null,
    });
    map.set(row.relatedId, list);
  }
  return map;
}

/**
 * The submission-row ids whose attachments make up one submission "unit": the
 * row itself for individual mode, or every member row for a group submission
 * (group files are shared across the team).
 */
async function submissionUnitRowIds(
  c: Context<AppEnv>,
  submission: typeof assignmentSubmissions.$inferSelect,
): Promise<string[]> {
  if (!submission.groupSubmissionId) return [submission.id];
  const db = c.get('db');
  const rows = await db
    .select({ id: assignmentSubmissions.id })
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.groupSubmissionId, submission.groupSubmissionId));
  return rows.map((r) => r.id);
}

/** Flattened attachment list for a submission unit (union across rows). */
async function attachmentsForUnit(
  c: Context<AppEnv>,
  submission: typeof assignmentSubmissions.$inferSelect,
): Promise<SubmissionAttachment[]> {
  const rowIds = await submissionUnitRowIds(c, submission);
  const map = await loadSubmissionAttachments(c, rowIds);
  return rowIds.flatMap((id) => map.get(id) ?? []);
}

async function ensureAssignmentViewable(
  c: Context<AppEnv>,
  row: typeof assignments.$inferSelect,
): Promise<void> {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') return;
  if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, row.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return;
  }
  // student
  if (row.status === 'draft') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Assignment is not published');
  }
  if (!(await isCourseEnrolled(db, row.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
}

// -------- Assignments --------

r.get(
  '/courses/:courseId/assignments',
  requireScopeGroup('assignmentsRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const visibleStatuses =
      auth.user.role === 'student'
        ? (['published', 'closed', 'archived'] as const)
        : (['draft', 'published', 'closed', 'archived'] as const);
    const rows = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.courseId, courseId),
          inArray(
            assignments.status,
            visibleStatuses as unknown as ('draft' | 'published' | 'closed' | 'archived')[],
          ),
        ),
      )
      .orderBy(asc(assignments.position), asc(assignments.createdAt));

    const ids = rows.map((r) => r.id);

    // Teachers/admins get the per-assignment submission count badge; students
    // get back their own submission row stitched into AssignmentSummary so
    // list views (Modules → Assignments, Assignments page) can render status
    // + submittedAt without one query per card.
    const counts = new Map<string, number>();
    const ungradedCounts = new Map<string, number>();
    const mine = new Map<string, typeof assignmentSubmissions.$inferSelect>();
    if (ids.length > 0) {
      if (auth.user.role === 'student') {
        const myRows = await db
          .select()
          .from(assignmentSubmissions)
          .where(
            and(
              inArray(assignmentSubmissions.assignmentId, ids),
              eq(assignmentSubmissions.studentId, auth.user.id),
            ),
          );
        for (const s of myRows) mine.set(s.assignmentId, s);
      } else {
        // Count "submission units" — for individual assignments that's the
        // student row, for group assignments that's the shared
        // group_submissions row, so a 4-person group counts once not four
        // times. COALESCE(group_submission_id, id) gives a stable de-dup
        // key per unit. Drafts are excluded from the totals because the
        // student hasn't actually turned anything in yet.
        const subs = await db
          .select({
            assignmentId: assignmentSubmissions.assignmentId,
            c: sql<number>`count(distinct coalesce(${assignmentSubmissions.groupSubmissionId}, ${assignmentSubmissions.id})) filter (where ${assignmentSubmissions.status} in ('submitted', 'late', 'graded', 'returned'))::int`,
            ungraded: sql<number>`count(distinct coalesce(${assignmentSubmissions.groupSubmissionId}, ${assignmentSubmissions.id})) filter (where ${assignmentSubmissions.status} in ('submitted', 'late') and ${assignmentSubmissions.score} is null)::int`,
          })
          .from(assignmentSubmissions)
          .where(inArray(assignmentSubmissions.assignmentId, ids))
          .groupBy(assignmentSubmissions.assignmentId);
        for (const s of subs) {
          counts.set(s.assignmentId, s.c);
          ungradedCounts.set(s.assignmentId, s.ungraded);
        }
      }
    }
    return success(
      c,
      rows.map((row) => {
        const summary = toAssignmentSummary(row, counts.get(row.id), ungradedCounts.get(row.id));
        const my = mine.get(row.id);
        if (my) {
          summary.mySubmission = {
            id: my.id,
            status: my.status,
            submittedAt: my.submittedAt ?? null,
            score: num(my.score),
          };
        }
        return summary;
      }),
    );
  },
);

r.post(
  '/courses/:courseId/assignments',
  requireScopeGroup('assignmentsWrite'),
  requireTokenCourseAccess(),
  validateJson(createAssignmentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAssignmentInput;
    if (input.moduleId) {
      const mod = (
        await db
          .select({ courseId: modules.courseId })
          .from(modules)
          .where(eq(modules.id, input.moduleId))
          .limit(1)
      )[0];
      if (!mod || mod.courseId !== courseId) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'moduleId must belong to this course');
      }
    }
    if (input.attachmentFileId) {
      const fa = (
        await db.select().from(fileAssets).where(eq(fileAssets.id, input.attachmentFileId)).limit(1)
      )[0];
      if (!fa) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'attachmentFileId not found');
      if (fa.courseId && fa.courseId !== courseId) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'attachment belongs to a different course');
      }
    }
    if (input.submissionMode === 'group') {
      if (!input.groupSetId) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'groupSetId is required when submissionMode is "group"',
        );
      }
      const setRow = (
        await db
          .select({ courseId: groupSets.courseId })
          .from(groupSets)
          .where(eq(groupSets.id, input.groupSetId))
          .limit(1)
      )[0];
      if (!setRow || setRow.courseId !== courseId) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'groupSetId must belong to this course',
        );
      }
    }

    const [created] = await db
      .insert(assignments)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        untilDate: input.untilDate ?? null,
        maxScore: input.maxScore != null ? input.maxScore.toString() : null,
        rubric: (input.rubric as Record<string, unknown> | undefined) ?? null,
        allowLateSubmission: input.allowLateSubmission ?? false,
        attachmentFileId: input.attachmentFileId ?? null,
        position: input.position ?? 0,
        status: 'draft',
        createdById: auth.user.id,
        submissionMode: input.submissionMode ?? 'individual',
        groupSetId: input.submissionMode === 'group' ? input.groupSetId ?? null : null,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create assignment');

    if (input.attachmentFileId) {
      await db
        .update(fileAssets)
        .set({
          relatedType: 'assignment',
          relatedId: created.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(fileAssets.id, input.attachmentFileId));
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'assignment.create',
      target: created.id,
      metadata: { courseId },
    });
    return success(c, toAssignmentSummary(created, 0), 201);
  },
);

r.get('/assignments/:assignmentId', requireScopeGroup('assignmentsRead'), async (c) => {
  const id = requireParam(c, 'assignmentId');
  const row = await loadAssignment(c, id);
  await ensureAssignmentViewable(c, row);
  return success(c, toAssignmentSummary(row));
});

r.patch(
  '/assignments/:assignmentId',
  requireScopeGroup('assignmentsWrite'),
  validateJson(updateAssignmentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'assignmentId');
    const row = await loadAssignment(c, id);
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateAssignmentInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.untilDate !== undefined) patch.untilDate = input.untilDate;
    if (input.maxScore !== undefined) {
      patch.maxScore = input.maxScore === null ? null : input.maxScore.toString();
    }
    if (input.rubric !== undefined) patch.rubric = input.rubric;
    if (input.allowLateSubmission !== undefined) patch.allowLateSubmission = input.allowLateSubmission;
    if (input.attachmentFileId !== undefined) patch.attachmentFileId = input.attachmentFileId;
    if (input.position !== undefined) patch.position = input.position;

    // Switching submissionMode after any submissions exist would orphan or
    // confuse those rows. Refuse instead of silently mutating state.
    const nextMode = input.submissionMode ?? row.submissionMode;
    const nextSetId =
      input.groupSetId !== undefined ? input.groupSetId : row.groupSetId ?? null;
    if (input.submissionMode !== undefined && input.submissionMode !== row.submissionMode) {
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.assignmentId, id));
      const subCount = countRows[0]?.count ?? 0;
      if (subCount > 0) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'Cannot change submission mode after submissions exist',
        );
      }
    }
    if (nextMode === 'group') {
      if (!nextSetId) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'groupSetId is required when submissionMode is "group"',
        );
      }
      const setRow = (
        await db
          .select({ courseId: groupSets.courseId })
          .from(groupSets)
          .where(eq(groupSets.id, nextSetId))
          .limit(1)
      )[0];
      if (!setRow || setRow.courseId !== row.courseId) {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'groupSetId must belong to this course',
        );
      }
    }
    if (input.submissionMode !== undefined) patch.submissionMode = input.submissionMode;
    if (input.groupSetId !== undefined) {
      patch.groupSetId = nextMode === 'group' ? input.groupSetId : null;
    } else if (input.submissionMode === 'individual') {
      patch.groupSetId = null;
    }

    const [updated] = await db
      .update(assignments)
      .set(patch)
      .where(eq(assignments.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Assignment not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'assignment.update',
      target: id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toAssignmentSummary(updated));
  },
);

r.delete('/assignments/:assignmentId', requireScopeGroup('assignmentsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'assignmentId');
  const row = await loadAssignment(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(assignments).where(eq(assignments.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'assignment.delete',
    target: id,
  });
  return success(c, { id });
});

async function transitionAssignment(
  c: Context<AppEnv>,
  next: 'published' | 'closed' | 'archived',
) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'assignmentId');
  const row = await loadAssignment(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  if (next === 'published' && row.maxScore == null) {
    throw new ApiException(
      409,
      ERROR_CODES.CONFLICT,
      'maxScore is required before publishing the assignment',
    );
  }
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  if (next === 'published') patch.publishedAt = new Date().toISOString();
  if (next === 'closed') patch.closedAt = new Date().toISOString();
  if (next === 'archived') patch.archivedAt = new Date().toISOString();
  const [updated] = await db
    .update(assignments)
    .set(patch)
    .where(eq(assignments.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Assignment not found');
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `assignment.${next}`,
    target: id,
  });
  return success(c, toAssignmentSummary(updated));
}

r.post('/assignments/:assignmentId/publish', requireScopeGroup('assignmentsWrite'), (c) =>
  transitionAssignment(c, 'published'),
);
r.post('/assignments/:assignmentId/close', requireScopeGroup('assignmentsWrite'), (c) =>
  transitionAssignment(c, 'closed'),
);
r.post('/assignments/:assignmentId/archive', requireScopeGroup('assignmentsWrite'), (c) =>
  transitionAssignment(c, 'archived'),
);

// -------- Submissions --------

r.get(
  '/assignments/:assignmentId/submissions',
  requireScopeGroup('submissionsRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'assignmentId');
    const assignment = await loadAssignment(c, id);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list all submissions');
    }
    if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, assignment.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    const rows = await db
      .select({
        s: assignmentSubmissions,
        student: { id: users.id, name: users.name, email: users.email },
        gsContent: groupSubmissions.content,
        gsSubmittedAt: groupSubmissions.submittedAt,
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .leftJoin(
        groupSubmissions,
        eq(groupSubmissions.id, assignmentSubmissions.groupSubmissionId),
      )
      .where(eq(assignmentSubmissions.assignmentId, id))
      .orderBy(asc(users.name));
    const attachmentsByRow = await loadSubmissionAttachments(
      c,
      rows.map((r) => r.s.id),
    );
    const out: SubmissionWithStudent[] = rows.map(({ s, student, gsContent, gsSubmittedAt }) => ({
      ...toSubmissionSummary(
        s,
        s.groupSubmissionId
          ? { content: gsContent ?? null, submittedAt: gsSubmittedAt ?? null }
          : undefined,
        attachmentsByRow.get(s.id) ?? [],
      ),
      student,
    }));
    return success(c, out);
  },
);

// Grouped view for teacher inbox on a group-mode assignment. Returns one
// entry per group (with the shared content + each member's per-row grade
// state) plus a bucket of ungrouped enrolled students (no submission yet).
r.get(
  '/assignments/:assignmentId/submissions/grouped',
  requireScopeGroup('submissionsRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'assignmentId');
    const assignment = await loadAssignment(c, id);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list all submissions');
    }
    if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, assignment.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    if (assignment.submissionMode !== 'group' || !assignment.groupSetId) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Assignment is not in group submission mode',
      );
    }

    const submissionRows = await db
      .select({
        s: assignmentSubmissions,
        student: { id: users.id, name: users.name, email: users.email },
        gs: groupSubmissions,
        group: { id: groups.id, name: groups.name },
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .innerJoin(groupSubmissions, eq(groupSubmissions.id, assignmentSubmissions.groupSubmissionId))
      .innerJoin(groups, eq(groups.id, groupSubmissions.groupId))
      .where(eq(assignmentSubmissions.assignmentId, id))
      .orderBy(asc(groups.position), asc(groups.name), asc(users.name));

    const byGroup = new Map<string, GroupSubmissionWithMembers>();
    const studentsWithSubmission = new Set<string>();
    for (const { s, student, gs, group } of submissionRows) {
      studentsWithSubmission.add(student.id);
      let entry = byGroup.get(gs.id);
      if (!entry) {
        entry = {
          groupSubmissionId: gs.id,
          groupId: group.id,
          groupName: group.name,
          sharedContent: gs.content ?? null,
          attachments: [],
          sharedSubmittedAt: gs.submittedAt ?? null,
          sharedSubmittedById: gs.submittedById ?? null,
          members: [],
        };
        byGroup.set(gs.id, entry);
      }
      entry.members.push({
        ...toSubmissionSummary(s, {
          content: gs.content ?? null,
          submittedAt: gs.submittedAt ?? null,
        }),
        student,
      });
    }

    // Group files are shared: a group's attachment list is the union of every
    // member row's files. Batch-load once, then fan the same list onto the
    // group entry and each member row.
    const groupAttachmentsByRow = await loadSubmissionAttachments(
      c,
      submissionRows.map((r) => r.s.id),
    );
    for (const entry of byGroup.values()) {
      const groupFiles = entry.members.flatMap((m) => groupAttachmentsByRow.get(m.id) ?? []);
      entry.attachments = groupFiles;
      for (const m of entry.members) m.attachments = groupFiles;
    }

    // Enrolled students whose group hasn't submitted yet (or who aren't in
    // any group of this set). Surfaced so the teacher can chase them.
    const ungroupedRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(eq(enrollments.courseId, assignment.courseId))
      .orderBy(asc(users.name));
    const ungroupedStudents = ungroupedRows.filter((u) => !studentsWithSubmission.has(u.id));

    // FERPA §99.32(a) — surfacing every member's record is a disclosure
    // (the student-role caller is already rejected above).
    const disclosedIds = Array.from(studentsWithSubmission);
    if (disclosedIds.length > 0) {
      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'submission.list-grouped',
        target: id,
        metadata: { courseId: assignment.courseId, count: disclosedIds.length },
        disclosedStudentIds: disclosedIds,
      });
    }

    const body: AssignmentSubmissionsByGroup = {
      groups: Array.from(byGroup.values()),
      ungroupedStudents,
    };
    return success(c, body);
  },
);

r.post(
  '/assignments/:assignmentId/submissions',
  requireScopeGroup('submissionsWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'assignmentId');
    const assignment = await loadAssignment(c, id);
    if (auth.user.role !== 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only students can create submissions');
    }
    if (assignment.status === 'draft') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Assignment is not published');
    }
    if (!(await isCourseEnrolled(db, assignment.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
    }
    // Scheduling gate: students cannot open / start an assignment outside
    // its [startDate, endDate] window. Per the design call, end_date hard-
    // blocks new starts (and submit actions further down).
    const now = Date.now();
    if (assignment.startDate && Date.parse(assignment.startDate) > now) {
      throw new ApiException(
        403,
        ERROR_CODES.FORBIDDEN,
        'Assignment is not open yet',
      );
    }
    if (assignment.endDate && Date.parse(assignment.endDate) < now) {
      throw new ApiException(
        403,
        ERROR_CODES.FORBIDDEN,
        'Assignment window has closed',
      );
    }

    if (assignment.submissionMode === 'group') {
      if (!assignment.groupSetId) {
        throw new ApiException(
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Group-mode assignment is missing groupSetId',
        );
      }
      const myGroup = await findStudentGroupForAssignment(
        db,
        assignment.groupSetId,
        auth.user.id,
      );
      if (!myGroup) {
        // Specific code so the student detail page can swap the submission
        // form for a friendly "join a group first" notice instead of just
        // showing a generic conflict toast.
        throw new ApiException(
          409,
          ERROR_CODES.NOT_IN_GROUP,
          'You are not in a group for this assignment',
        );
      }
      const groupSubId = await ensureGroupSubmissionFannedOut(
        db,
        id,
        myGroup.groupId,
        auth.user.id,
      );

      const [myRow] = await db
        .select()
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.assignmentId, id),
            eq(assignmentSubmissions.studentId, auth.user.id),
          ),
        )
        .limit(1);
      if (!myRow) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Submission row not created');
      }
      const [gs] = await db
        .select()
        .from(groupSubmissions)
        .where(eq(groupSubmissions.id, groupSubId))
        .limit(1);
      const memberRows = await db
        .select({ studentId: groupMemberships.studentId, name: users.name })
        .from(groupMemberships)
        .innerJoin(users, eq(users.id, groupMemberships.studentId))
        .where(eq(groupMemberships.groupId, myGroup.groupId));

      const groupFiles = await attachmentsForUnit(c, myRow);
      const body: MyAssignmentSubmissionResponse = {
        submission: toSubmissionSummary(myRow, gs ?? undefined, groupFiles),
        group: {
          groupId: myGroup.groupId,
          groupName: myGroup.groupName,
          members: memberRows,
          sharedContent: gs?.content ?? null,
          attachments: groupFiles,
          sharedSubmittedAt: gs?.submittedAt ?? null,
          sharedSubmittedById: gs?.submittedById ?? null,
        },
      };
      return success(c, body);
    }

    // Individual mode (unchanged behaviour).
    const existing = (
      await db
        .select()
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.assignmentId, id),
            eq(assignmentSubmissions.studentId, auth.user.id),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      const body: MyAssignmentSubmissionResponse = {
        submission: toSubmissionSummary(existing, undefined, await attachmentsForUnit(c, existing)),
      };
      return success(c, body);
    }
    const [created] = await db
      .insert(assignmentSubmissions)
      .values({
        assignmentId: id,
        studentId: auth.user.id,
        status: 'draft',
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create submission');
    const body: MyAssignmentSubmissionResponse = {
      submission: toSubmissionSummary(created),
    };
    return success(c, body, 201);
  },
);

async function loadSubmission(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.id, id))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');
  return row;
}

r.get('/submissions/:submissionId', requireScopeGroup('submissionsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'submissionId');
  const submission = await loadSubmission(c, id);
  const assignment = await loadAssignment(c, submission.assignmentId);
  if (auth.user.role === 'student') {
    if (submission.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot view another student submission');
    }
  } else if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, assignment.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
  }

  // FERPA §99.32(a): course staff (teacher or admin) viewing another
  // student's submission is a disclosure of that student's education
  // record. A student viewing their own submission isn't a disclosure under
  // FERPA — the student already has access to their own records.
  if (auth.user.role !== 'student') {
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'submission.view',
      target: id,
      metadata: { assignmentId: assignment.id, courseId: assignment.courseId },
      disclosedStudentIds: submission.studentId,
    });
  }

  const gs = await loadGroupSubmissionForRow(c, submission);
  return success(
    c,
    toSubmissionSummary(submission, gs ?? undefined, await attachmentsForUnit(c, submission)),
  );
});

r.patch(
  '/submissions/:submissionId',
  requireScopeGroup('submissionsWrite'),
  validateJson(updateSubmissionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'submissionId');
    const submission = await loadSubmission(c, id);
    if (auth.user.role !== 'student' || submission.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can edit this submission');
    }
    if (submission.status !== 'draft' && submission.status !== 'returned') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Submission can only be edited while DRAFT or RETURNED');
    }
    const input = c.get('validated') as UpdateSubmissionInput;

    // Group submission: write the shared text answer to the group_submissions
    // row so every teammate sees the same edit. Files are managed separately
    // via the attachment endpoints below.
    if (submission.groupSubmissionId) {
      const groupPatch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (input.textAnswer !== undefined) groupPatch.content = input.textAnswer;
      const [gs] = await db
        .update(groupSubmissions)
        .set(groupPatch)
        .where(eq(groupSubmissions.id, submission.groupSubmissionId))
        .returning();
      // Touch the per-member row's updatedAt so client caches refresh.
      const [updated] = await db
        .update(assignmentSubmissions)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(assignmentSubmissions.id, id))
        .returning();
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');
      return success(
        c,
        toSubmissionSummary(updated, gs ?? undefined, await attachmentsForUnit(c, updated)),
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.textAnswer !== undefined) patch.content = input.textAnswer;

    const [updated] = await db
      .update(assignmentSubmissions)
      .set(patch)
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

    return success(c, toSubmissionSummary(updated, undefined, await attachmentsForUnit(c, updated)));
  },
);

// Attach an already-uploaded file to a submission. The student uploads via
// POST /files/upload (relatedType='submission'), then links it here. Group
// members attach to their own row; the file still shows for the whole team
// because the unit's attachment list unions across member rows.
r.post(
  '/submissions/:submissionId/attachments',
  requireScopeGroup('submissionsWrite'),
  validateJson(addSubmissionAttachmentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'submissionId');
    const submission = await loadSubmission(c, id);
    if (auth.user.role !== 'student' || submission.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can edit this submission');
    }
    if (submission.status !== 'draft' && submission.status !== 'returned') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Submission can only be edited while DRAFT or RETURNED');
    }
    const input = c.get('validated') as AddSubmissionAttachmentInput;

    const [file] = await db
      .select()
      .from(fileAssets)
      .where(eq(fileAssets.id, input.fileAssetId))
      .limit(1);
    if (!file || file.status !== 'ready') {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'File not found');
    }
    if (file.ownerId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'You can only attach your own uploads');
    }
    const unitRowIds = await submissionUnitRowIds(c, submission);
    // Already attached to this submission unit → idempotent no-op.
    if (file.relatedType === 'submission' && file.relatedId && unitRowIds.includes(file.relatedId)) {
      return success(c, await attachmentsForUnit(c, submission));
    }
    // Reject files already tied to a different submission.
    if (file.relatedId && file.relatedType === 'submission') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'File is already attached to another submission');
    }
    const existing = await attachmentsForUnit(c, submission);
    if (existing.length >= MAX_SUBMISSION_FILES) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        `A submission can have at most ${MAX_SUBMISSION_FILES} files`,
      );
    }
    await db
      .update(fileAssets)
      .set({ relatedType: 'submission', relatedId: submission.id, updatedAt: new Date().toISOString() })
      .where(eq(fileAssets.id, input.fileAssetId));
    // Touch the member row so caches refresh.
    await db
      .update(assignmentSubmissions)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(assignmentSubmissions.id, id));
    return success(c, await attachmentsForUnit(c, submission), 201);
  },
);

// Remove a file from a submission (soft-delete so the R2 cleanup job reclaims
// it). Any member of a group submission may remove a shared file.
r.delete(
  '/submissions/:submissionId/attachments/:fileAssetId',
  requireScopeGroup('submissionsWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'submissionId');
    const fileAssetId = requireParam(c, 'fileAssetId');
    const submission = await loadSubmission(c, id);
    if (auth.user.role !== 'student' || submission.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can edit this submission');
    }
    if (submission.status !== 'draft' && submission.status !== 'returned') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Submission can only be edited while DRAFT or RETURNED');
    }
    const [file] = await db
      .select()
      .from(fileAssets)
      .where(eq(fileAssets.id, fileAssetId))
      .limit(1);
    const unitRowIds = await submissionUnitRowIds(c, submission);
    if (
      !file ||
      file.status !== 'ready' ||
      file.relatedType !== 'submission' ||
      !file.relatedId ||
      !unitRowIds.includes(file.relatedId)
    ) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Attachment not found on this submission');
    }
    await db
      .update(fileAssets)
      .set({ status: 'deleted', updatedAt: new Date().toISOString() })
      .where(eq(fileAssets.id, fileAssetId));
    await db
      .update(assignmentSubmissions)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(assignmentSubmissions.id, id));
    return success(c, await attachmentsForUnit(c, submission));
  },
);

r.post(
  '/submissions/:submissionId/submit',
  requireScopeGroup('submissionsWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'submissionId');
    const submission = await loadSubmission(c, id);
    if (auth.user.role !== 'student' || submission.studentId !== auth.user.id) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the owning student can submit');
    }
    // A graded submission can't be resubmitted without a teacher return.
    if (submission.status === 'graded') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'A graded submission cannot be resubmitted');
    }
    // Idempotent no-op for an already-submitted row. In group mode any member's
    // submit fans the submitted status out to every teammate's row, so a
    // teammate (or a double-click) hitting submit afterwards would otherwise
    // get a confusing "conflict with another change". Echo the current state
    // instead. Only draft/returned rows fall through to a real submit.
    if (submission.status === 'submitted' || submission.status === 'late') {
      const gs = await loadGroupSubmissionForRow(c, submission);
      return success(
        c,
        toSubmissionSummary(submission, gs ?? undefined, await attachmentsForUnit(c, submission)),
      );
    }
    const assignment = await loadAssignment(c, submission.assignmentId);
    if (assignment.status === 'archived') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Assignment is archived');
    }
    // Scheduling gate (mirrors the POST /submissions check): refuse submit
    // before start_date or after end_date. until_date is the absolute
    // backstop for in-progress drafts started inside the window.
    const submittedAtMs = Date.now();
    if (assignment.startDate && Date.parse(assignment.startDate) > submittedAtMs) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Assignment is not open yet',
      );
    }
    if (assignment.endDate && Date.parse(assignment.endDate) < submittedAtMs) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Assignment window has closed',
      );
    }
    if (assignment.untilDate && Date.parse(assignment.untilDate) < submittedAtMs) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Assignment deadline has passed',
      );
    }
    const submittedAt = new Date(submittedAtMs).toISOString();
    const status = determineSubmissionStatus({
      submittedAt,
      dueDate: assignment.dueDate,
      allowLateSubmission: assignment.allowLateSubmission,
    });
    if (assignment.status === 'closed' && status === 'late') {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Assignment is closed and does not accept late submissions',
      );
    }

    // Group submission: mark the shared row submitted and fan the status
    // out to every linked per-member row so all teammates flip to
    // submitted/late together. Returned rows that have since been graded
    // stay in their current status (we only flip draft/returned rows).
    if (submission.groupSubmissionId) {
      await db
        .update(groupSubmissions)
        .set({ submittedAt, submittedById: auth.user.id, updatedAt: submittedAt })
        .where(eq(groupSubmissions.id, submission.groupSubmissionId));
      await db
        .update(assignmentSubmissions)
        .set({ status, submittedAt, updatedAt: submittedAt })
        .where(
          and(
            eq(assignmentSubmissions.groupSubmissionId, submission.groupSubmissionId),
            inArray(assignmentSubmissions.status, ['draft', 'returned']),
          ),
        );
      const [updated] = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, id))
        .limit(1);
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');
      const [gs] = await db
        .select()
        .from(groupSubmissions)
        .where(eq(groupSubmissions.id, submission.groupSubmissionId))
        .limit(1);
      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'submission.submit',
        target: id,
        metadata: {
          status,
          dueDate: assignment.dueDate,
          groupSubmissionId: submission.groupSubmissionId,
        },
      });
      return success(c, toSubmissionSummary(updated, gs ?? undefined));
    }

    const [updated] = await db
      .update(assignmentSubmissions)
      .set({
        status,
        submittedAt,
        updatedAt: submittedAt,
      })
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'submission.submit',
      target: id,
      metadata: { status, dueDate: assignment.dueDate },
    });
    return success(c, toSubmissionSummary(updated));
  },
);

// /return and /grade accept BOTH POST and PATCH. The grade endpoint
// historically registered only PATCH, which made Hono return a stale-looking
// 404 to any POST attempt instead of the handler's "Submission not found".
// Sibling endpoints disagree on the verb (/submit is POST, /grade is PATCH),
// so we register both verbs against shared handlers to remove the trap.

async function returnSubmissionHandler(c: Context<AppEnv>) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'submissionId');
  const submission = await loadSubmission(c, id);
  const assignment = await loadAssignment(c, submission.assignmentId);
  if (auth.user.role === 'student') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only a teacher can return a submission');
  }
  if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, assignment.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
  }
  if (submission.status === 'draft') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Cannot return a draft submission');
  }
  const input = c.get('validated') as ReturnSubmissionInput;
  const now = new Date().toISOString();
  // Mirror group grading: returning a group submission resets and re-sends
  // feedback to every member row at once. Individual submissions touch one row.
  const updatedRows = await db
    .update(assignmentSubmissions)
    .set({
      status: 'returned',
      score: null,
      gradedAt: null,
      gradedById: null,
      feedback: input.feedback ?? submission.feedback ?? null,
      updatedAt: now,
    })
    .where(
      submission.groupSubmissionId
        ? eq(assignmentSubmissions.groupSubmissionId, submission.groupSubmissionId)
        : eq(assignmentSubmissions.id, id),
    )
    .returning();
  const updated = updatedRows.find((row) => row.id === id) ?? updatedRows[0];
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'submission.return',
    target: id,
    metadata: submission.groupSubmissionId
      ? { groupSubmissionId: submission.groupSubmissionId, memberCount: updatedRows.length }
      : undefined,
  });
  const gs = await loadGroupSubmissionForRow(c, updated);
  return success(c, toSubmissionSummary(updated, gs ?? undefined));
}

r.post(
  '/submissions/:submissionId/return',
  requireScopeGroup('submissionsWrite'),
  validateJson(returnSubmissionSchema),
  returnSubmissionHandler,
);

r.patch(
  '/submissions/:submissionId/return',
  requireScopeGroup('submissionsWrite'),
  validateJson(returnSubmissionSchema),
  returnSubmissionHandler,
);

async function gradeSubmissionHandler(c: Context<AppEnv>) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'submissionId');
  const submission = await loadSubmission(c, id);
  const assignment = await loadAssignment(c, submission.assignmentId);
  if (auth.user.role === 'student') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only a teacher can grade');
  }
  if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, assignment.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
  }
  if (submission.status === 'draft') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Cannot grade a draft submission');
  }
  const input = c.get('validated') as GradeSubmissionInput;
  const max = num(assignment.maxScore);
  if (max == null) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Assignment has no maxScore');
  }
  const clamped = clampScore(input.score, max);
  const now = new Date().toISOString();
  // Group submissions are graded as a unit: fan the score and feedback out to
  // every member row linked to the same group_submissions row, so the whole
  // team lands on the same grade. Individual submissions touch just their row.
  const updatedRows = await db
    .update(assignmentSubmissions)
    .set({
      score: clamped.toString(),
      feedback: input.feedback ?? null,
      status: 'graded',
      gradedAt: now,
      gradedById: auth.user.id,
      updatedAt: now,
    })
    .where(
      submission.groupSubmissionId
        ? eq(assignmentSubmissions.groupSubmissionId, submission.groupSubmissionId)
        : eq(assignmentSubmissions.id, id),
    )
    .returning();
  const updated = updatedRows.find((row) => row.id === id) ?? updatedRows[0];
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'submission.grade',
    target: id,
    metadata: submission.groupSubmissionId
      ? {
          score: clamped,
          groupSubmissionId: submission.groupSubmissionId,
          memberCount: updatedRows.length,
        }
      : { score: clamped },
  });
  const gs = await loadGroupSubmissionForRow(c, updated);
  return success(c, toSubmissionSummary(updated, gs ?? undefined));
}

r.patch(
  '/submissions/:submissionId/grade',
  requireScopeGroup('submissionsWrite'),
  validateJson(gradeSubmissionSchema),
  gradeSubmissionHandler,
);

r.post(
  '/submissions/:submissionId/grade',
  requireScopeGroup('submissionsWrite'),
  validateJson(gradeSubmissionSchema),
  gradeSubmissionHandler,
);

export default r;
