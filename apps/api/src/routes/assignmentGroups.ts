import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import {
  createAssignmentGroupSchema,
  reorderAssignmentGroupsSchema,
  updateAssignmentGroupSchema,
  type CreateAssignmentGroupInput,
  type ReorderAssignmentGroupsInput,
  type UpdateAssignmentGroupInput,
} from '@coursewise/shared';
import { assignmentGroups } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse } from '../services/courseAccess';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

r.get(
  '/courses/:courseId/assignment-groups',
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
        ag.id, ag.course_id AS "courseId", ag.name, ag.weight, ag.position,
        ag.created_at AS "createdAt", ag.updated_at AS "updatedAt",
        (
          (SELECT count(*) FROM assignments       WHERE group_id = ag.id) +
          (SELECT count(*) FROM quizzes           WHERE group_id = ag.id) +
          (SELECT count(*) FROM discussion_topics WHERE group_id = ag.id)
        )::int AS "itemCount"
      FROM assignment_groups ag
      WHERE ag.course_id = ${courseId}
      ORDER BY ag.position
    `);
    return success(c, result.rows);
  },
);

r.post(
  '/courses/:courseId/assignment-groups',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createAssignmentGroupSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAssignmentGroupInput;

    let position = input.position;
    if (position === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${assignmentGroups.position}), -1)` })
        .from(assignmentGroups)
        .where(eq(assignmentGroups.courseId, courseId));
      position = (maxRow?.max ?? -1) + 1;
    }

    try {
      const [inserted] = await db
        .insert(assignmentGroups)
        .values({ courseId, name: input.name, weight: input.weight, position })
        .returning();
      if (!inserted) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create group');
      }

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-group.create',
        target: inserted.id,
        metadata: { courseId, name: inserted.name },
      });
      return success(c, inserted, 201);
    } catch (e) {
      if (String(e).includes('assignment_groups_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A group with that name already exists');
      }
      throw e;
    }
  },
);

r.patch(
  '/courses/:courseId/assignment-groups/:groupId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateAssignmentGroupSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const groupId = requireParam(c, 'groupId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateAssignmentGroupInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.weight !== undefined) patch.weight = input.weight;
    if (input.position !== undefined) patch.position = input.position;

    try {
      const [updated] = await db
        .update(assignmentGroups)
        .set(patch)
        .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.courseId, courseId)))
        .returning();
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group not found');

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-group.update',
        target: groupId,
        metadata: { courseId, fields: Object.keys(patch) },
      });
      return success(c, updated);
    } catch (e) {
      if (String(e).includes('assignment_groups_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A group with that name already exists');
      }
      throw e;
    }
  },
);

r.delete(
  '/courses/:courseId/assignment-groups/:groupId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const groupId = requireParam(c, 'groupId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    const countResult = await db.execute(sql`
      SELECT (
        (SELECT count(*) FROM assignments       WHERE group_id = ${groupId}) +
        (SELECT count(*) FROM quizzes           WHERE group_id = ${groupId}) +
        (SELECT count(*) FROM discussion_topics WHERE group_id = ${groupId})
      )::int AS count
    `);
    const count = (countResult.rows[0] as { count: number } | undefined)?.count ?? 0;

    const [deleted] = await db
      .delete(assignmentGroups)
      .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.courseId, courseId)))
      .returning({ id: assignmentGroups.id });
    if (!deleted) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'assignment-group.delete',
      target: groupId,
      metadata: { courseId, orphanedItemCount: count },
    });
    return success(c, { id: groupId, orphanedItemCount: count });
  },
);

r.post(
  '/courses/:courseId/assignment-groups/reorder',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(reorderAssignmentGroupsSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as ReorderAssignmentGroupsInput;
    const valuesSql = sql.join(
      input.orderedIds.map((id, idx) => sql`(${id}::uuid, ${idx})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE assignment_groups AS ag
         SET position = v.position, updated_at = now()
        FROM (VALUES ${valuesSql}) AS v(id, position)
       WHERE ag.id = v.id AND ag.course_id = ${courseId}
    `);
    return c.body(null, 204);
  },
);

export default r;
