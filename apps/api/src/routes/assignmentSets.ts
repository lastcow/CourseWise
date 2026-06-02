import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import {
  createAssignmentSetSchema,
  updateAssignmentSetSchema,
  type CreateAssignmentSetInput,
  type UpdateAssignmentSetInput,
} from '@coursewise/shared';
import { assignmentSets, finalGrades } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse } from '../services/courseAccess';
import type { AppEnv } from '../types';
import type { Db } from '../db/client';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// Changing a set (or its category) changes the rolled-up score that feeds the
// gradebook, so flag the course's final grades stale — same signal a grading
// policy change emits. The actual recompute happens on the teacher's next
// Recalculate (POST /final-grades/recalculate).
async function markFinalGradesOutdated(db: Db, courseId: string): Promise<void> {
  await db
    .update(finalGrades)
    .set({ isOutdated: true, updatedAt: new Date().toISOString() })
    .where(eq(finalGrades.courseId, courseId));
}

r.get(
  '/courses/:courseId/assignment-sets',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canAccessCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
    const result = await db.execute(sql`
      SELECT
        s.id, s.course_id AS "courseId", s.group_id AS "groupId", s.name,
        s.scoring_rule AS "scoringRule", s.position,
        s.created_at AS "createdAt", s.updated_at AS "updatedAt",
        (SELECT count(*) FROM assignments WHERE set_id = s.id)::int AS "memberCount"
      FROM assignment_sets s
      WHERE s.course_id = ${courseId}
      ORDER BY s.position
    `);
    return success(c, result.rows);
  },
);

r.post(
  '/courses/:courseId/assignment-sets',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createAssignmentSetSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAssignmentSetInput;

    let position = input.position;
    if (position === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${assignmentSets.position}), -1)` })
        .from(assignmentSets)
        .where(eq(assignmentSets.courseId, courseId));
      position = (maxRow?.max ?? -1) + 1;
    }

    try {
      const [inserted] = await db
        .insert(assignmentSets)
        .values({
          courseId,
          groupId: input.groupId ?? null,
          name: input.name,
          scoringRule: input.scoringRule ?? 'average',
          position,
        })
        .returning();
      if (!inserted) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create set');
      }
      await markFinalGradesOutdated(db, courseId);

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-set.create',
        target: inserted.id,
        metadata: { courseId, name: inserted.name },
      });
      return success(c, inserted, 201);
    } catch (e) {
      if (String(e).includes('assignment_sets_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A set with that name already exists');
      }
      throw e;
    }
  },
);

r.patch(
  '/courses/:courseId/assignment-sets/:setId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateAssignmentSetSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateAssignmentSetInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.scoringRule !== undefined) patch.scoringRule = input.scoringRule;
    if (input.position !== undefined) patch.position = input.position;

    try {
      const [updated] = await db
        .update(assignmentSets)
        .set(patch)
        .where(and(eq(assignmentSets.id, setId), eq(assignmentSets.courseId, courseId)))
        .returning();
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Set not found');
      await markFinalGradesOutdated(db, courseId);

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-set.update',
        target: setId,
        metadata: { courseId, fields: Object.keys(patch) },
      });
      return success(c, updated);
    } catch (e) {
      if (String(e).includes('assignment_sets_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A set with that name already exists');
      }
      throw e;
    }
  },
);

r.delete(
  '/courses/:courseId/assignment-sets/:setId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const setId = requireParam(c, 'setId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    const countResult = await db.execute(sql`
      SELECT (SELECT count(*) FROM assignments WHERE set_id = ${setId})::int AS count
    `);
    const count = (countResult.rows[0] as { count: number } | undefined)?.count ?? 0;

    const [deleted] = await db
      .delete(assignmentSets)
      .where(and(eq(assignmentSets.id, setId), eq(assignmentSets.courseId, courseId)))
      .returning({ id: assignmentSets.id });
    if (!deleted) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Set not found');
    await markFinalGradesOutdated(db, courseId);

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'assignment-set.delete',
      target: setId,
      metadata: { courseId, orphanedItemCount: count },
    });
    return success(c, { id: setId, orphanedItemCount: count });
  },
);

export default r;
