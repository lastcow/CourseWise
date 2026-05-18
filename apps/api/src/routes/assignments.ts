import { Hono, type Context } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  createAssignmentSchema,
  gradeSubmissionSchema,
  returnSubmissionSchema,
  updateAssignmentSchema,
  updateSubmissionSchema,
  type AssignmentSummary,
  type CreateAssignmentInput,
  type GradeSubmissionInput,
  type ReturnSubmissionInput,
  type SubmissionSummary,
  type SubmissionWithStudent,
  type UpdateAssignmentInput,
  type UpdateSubmissionInput,
} from '@coursewise/shared';
import {
  assignmentSubmissions,
  assignments,
  fileAssets,
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
): AssignmentSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    title: row.title,
    description: row.description ?? null,
    dueDate: row.dueDate ?? null,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSubmissionSummary(row: typeof assignmentSubmissions.$inferSelect): SubmissionSummary {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    status: row.status,
    textAnswer: row.content ?? null,
    fileAssetId: row.fileAssetId ?? null,
    submittedAt: row.submittedAt ?? null,
    score: num(row.score),
    feedback: row.feedback ?? null,
    gradedAt: row.gradedAt ?? null,
    gradedById: row.gradedById ?? null,
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

    // batch submission counts
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0 && auth.user.role !== 'student') {
      const subs = await db
        .select({ assignmentId: assignmentSubmissions.assignmentId, c: sql<number>`count(*)::int` })
        .from(assignmentSubmissions)
        .where(inArray(assignmentSubmissions.assignmentId, ids))
        .groupBy(assignmentSubmissions.assignmentId);
      for (const s of subs) counts.set(s.assignmentId, s.c);
    }
    return success(c, rows.map((row) => toAssignmentSummary(row, counts.get(row.id))));
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

    const [created] = await db
      .insert(assignments)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        maxScore: input.maxScore != null ? input.maxScore.toString() : null,
        rubric: (input.rubric as Record<string, unknown> | undefined) ?? null,
        allowLateSubmission: input.allowLateSubmission ?? false,
        attachmentFileId: input.attachmentFileId ?? null,
        position: input.position ?? 0,
        status: 'draft',
        createdById: auth.user.id,
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
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.maxScore !== undefined) {
      patch.maxScore = input.maxScore === null ? null : input.maxScore.toString();
    }
    if (input.rubric !== undefined) patch.rubric = input.rubric;
    if (input.allowLateSubmission !== undefined) patch.allowLateSubmission = input.allowLateSubmission;
    if (input.attachmentFileId !== undefined) patch.attachmentFileId = input.attachmentFileId;
    if (input.position !== undefined) patch.position = input.position;

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
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .where(eq(assignmentSubmissions.assignmentId, id))
      .orderBy(asc(users.name));
    const out: SubmissionWithStudent[] = rows.map(({ s, student }) => ({
      ...toSubmissionSummary(s),
      student,
    }));
    return success(c, out);
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
      return success(c, toSubmissionSummary(existing));
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
    return success(c, toSubmissionSummary(created), 201);
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
  return success(c, toSubmissionSummary(submission));
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
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.textAnswer !== undefined) patch.content = input.textAnswer;
    if (input.fileAssetId !== undefined) patch.fileAssetId = input.fileAssetId;

    const [updated] = await db
      .update(assignmentSubmissions)
      .set(patch)
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

    if (input.fileAssetId) {
      await db
        .update(fileAssets)
        .set({
          relatedType: 'submission',
          relatedId: updated.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(fileAssets.id, input.fileAssetId));
    }

    return success(c, toSubmissionSummary(updated));
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
    if (submission.status !== 'draft' && submission.status !== 'returned') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Submission must be DRAFT or RETURNED');
    }
    const assignment = await loadAssignment(c, submission.assignmentId);
    if (assignment.status === 'archived') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Assignment is archived');
    }
    const submittedAt = new Date().toISOString();
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

r.post(
  '/submissions/:submissionId/return',
  requireScopeGroup('submissionsWrite'),
  validateJson(returnSubmissionSchema),
  async (c) => {
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
    const [updated] = await db
      .update(assignmentSubmissions)
      .set({
        status: 'returned',
        score: null,
        gradedAt: null,
        gradedById: null,
        feedback: input.feedback ?? submission.feedback ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'submission.return',
      target: id,
    });
    return success(c, toSubmissionSummary(updated));
  },
);

r.patch(
  '/submissions/:submissionId/grade',
  requireScopeGroup('submissionsWrite'),
  validateJson(gradeSubmissionSchema),
  async (c) => {
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
    const [updated] = await db
      .update(assignmentSubmissions)
      .set({
        score: clamped.toString(),
        feedback: input.feedback ?? null,
        status: 'graded',
        gradedAt: now,
        gradedById: auth.user.id,
        updatedAt: now,
      })
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Submission not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'submission.grade',
      target: id,
      metadata: { score: clamped },
    });
    return success(c, toSubmissionSummary(updated));
  },
);

export default r;
