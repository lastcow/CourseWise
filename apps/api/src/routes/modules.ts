import { Hono } from 'hono';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import {
  createModuleSchema,
  reorderModulesSchema,
  updateModuleSchema,
  type CreateModuleInput,
  type ModuleSummary,
  type ReorderModulesInput,
  type UpdateModuleInput,
} from '@coursewise/shared';
import { modules } from '../db/schema';
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
import { canWriteCourse } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function toSummary(row: typeof modules.$inferSelect): ModuleSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

r.get(
  '/courses/:courseId/modules',
  requireScopeGroup('coursesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const rows = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position), asc(modules.createdAt));
    return success(c, rows.map(toSummary));
  },
);

r.post(
  '/courses/:courseId/modules',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createModuleSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateModuleInput;
    const maxRow = (
      await db
        .select({ maxPos: max(modules.position) })
        .from(modules)
        .where(eq(modules.courseId, courseId))
    )[0];
    const next = ((maxRow?.maxPos ?? -1) as number) + 1;

    const [created] = await db
      .insert(modules)
      .values({
        courseId,
        title: input.title,
        description: input.description ?? null,
        position: next,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create module');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'module.create',
      target: created.id,
      metadata: { courseId, position: next },
    });
    return success(c, toSummary(created), 201);
  },
);

r.post(
  '/courses/:courseId/modules/reorder',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(reorderModulesSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as ReorderModulesInput;
    const ids = input.ids;

    // Confirm every id belongs to this course.
    const existing = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.courseId, courseId), inArray(modules.id, ids)));
    if (existing.length !== ids.length) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Reorder ids must all belong to this course');
    }

    // Neon HTTP driver does not expose `db.transaction`. Emulate via a single
    // CASE WHEN update so it's atomic on the server side.
    const cases = ids.map((id, idx) => sql`WHEN ${id}::uuid THEN ${idx}::int`);
    await db.execute(sql`
      UPDATE modules
      SET position = CASE id ${sql.join(cases, sql` `)} END,
          updated_at = now()
      WHERE course_id = ${courseId}::uuid AND id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
    `);

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'module.reorder',
      target: courseId,
      metadata: { ids },
    });

    const rows = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position));
    return success(c, rows.map(toSummary));
  },
);

r.get('/modules/:moduleId', requireScopeGroup('coursesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const moduleId = requireParam(c, 'moduleId');
  const [row] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
  // Reuse course access check
  if (auth.user.role !== 'admin') {
    const { canAccessCourse } = await import('../services/courseAccess');
    if (!(await canAccessCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
  }
  return success(c, toSummary(row));
});

r.patch(
  '/modules/:moduleId',
  requireScopeGroup('coursesWrite'),
  validateJson(updateModuleSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const moduleId = requireParam(c, 'moduleId');
    const [row] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateModuleInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;

    const [updated] = await db
      .update(modules)
      .set(patch)
      .where(eq(modules.id, moduleId))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'module.update',
      target: moduleId,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toSummary(updated));
  },
);

r.delete('/modules/:moduleId', requireScopeGroup('coursesWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const moduleId = requireParam(c, 'moduleId');
  const [row] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }

  // Cascade in DB removes presentations/assignments/etc; reading_materials.moduleId is now SET NULL.
  await db.delete(modules).where(eq(modules.id, moduleId));

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'module.delete',
    target: moduleId,
  });
  return success(c, { id: moduleId });
});

export default r;
