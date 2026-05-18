import { Hono, type Context } from 'hono';
import type { Db } from '../db/client';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  createMaterialSchema,
  updateMaterialSchema,
  type CreateMaterialInput,
  type MaterialSummary,
  type UpdateMaterialInput,
} from '@coursewise/shared';
import { fileAssets, modules, readingMaterials } from '../db/schema';
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
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

function toSummary(row: typeof readingMaterials.$inferSelect): MaterialSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    title: row.title,
    type: row.type,
    sourceType: row.sourceType,
    content: row.content ?? null,
    externalUrl: row.externalUrl ?? null,
    fileAssetId: row.fileAssetId ?? null,
    status: row.status,
    publishedAt: row.publishedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

r.get(
  '/courses/:courseId/materials',
  requireScopeGroup('materialsRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const filterStatus = auth.user.role === 'student' ? ['published'] : ['draft', 'published', 'archived'];
    const rows = await db
      .select()
      .from(readingMaterials)
      .where(
        and(
          eq(readingMaterials.courseId, courseId),
          inArray(readingMaterials.status, filterStatus as ('draft' | 'published' | 'archived')[]),
        ),
      )
      .orderBy(asc(readingMaterials.position), asc(readingMaterials.createdAt));
    return success(c, rows.map(toSummary));
  },
);

r.post(
  '/courses/:courseId/materials',
  requireScopeGroup('materialsWrite'),
  requireTokenCourseAccess(),
  validateJson(createMaterialSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateMaterialInput;

    if (input.moduleId) {
      const mod = (
        await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, input.moduleId)).limit(1)
      )[0];
      if (!mod) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'moduleId not found');
      if (mod.courseId !== courseId) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'moduleId belongs to a different course');
      }
    }
    if (input.fileAssetId) {
      const fa = (
        await db.select().from(fileAssets).where(eq(fileAssets.id, input.fileAssetId)).limit(1)
      )[0];
      if (!fa) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'fileAssetId not found');
      if (fa.courseId && fa.courseId !== courseId) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'fileAsset belongs to a different course');
      }
      if (fa.status !== 'ready') {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'fileAsset must be in READY state — complete upload first',
        );
      }
    }

    const [inserted] = await db
      .insert(readingMaterials)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        type: input.type ?? 'document',
        sourceType: input.sourceType,
        content: input.content ?? null,
        externalUrl: input.externalUrl ?? null,
        fileAssetId: input.fileAssetId ?? null,
        status: 'draft',
        position: input.position ?? 0,
        createdById: auth.user.id,
      })
      .returning();
    if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create material');

    if (input.fileAssetId) {
      await db
        .update(fileAssets)
        .set({
          relatedType: 'material',
          relatedId: inserted.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(fileAssets.id, input.fileAssetId));
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'material.create',
      target: inserted.id,
      metadata: { courseId, sourceType: input.sourceType },
    });
    return success(c, toSummary(inserted), 201);
  },
);

async function canViewMaterial(
  db: Db,
  user: { id: string; role: 'admin' | 'teacher' | 'student' },
  material: typeof readingMaterials.$inferSelect,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, material.courseId, user.id);
  if (material.status !== 'published') return false;
  return isCourseEnrolled(db, material.courseId, user.id);
}

r.get('/materials/:materialId', requireScopeGroup('materialsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'materialId');
  const row = (await db.select().from(readingMaterials).where(eq(readingMaterials.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');
  if (!(await canViewMaterial(db, auth.user, row))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this material');
  }
  return success(c, toSummary(row));
});

r.patch(
  '/materials/:materialId',
  requireScopeGroup('materialsWrite'),
  validateJson(updateMaterialSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'materialId');
    const row = (await db.select().from(readingMaterials).where(eq(readingMaterials.id, id)).limit(1))[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateMaterialInput;

    if (input.moduleId !== undefined && input.moduleId !== null) {
      const mod = (
        await db
          .select({ courseId: modules.courseId })
          .from(modules)
          .where(eq(modules.id, input.moduleId))
          .limit(1)
      )[0];
      if (!mod) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'moduleId not found');
      if (mod.courseId !== row.courseId) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'moduleId belongs to a different course');
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.type !== undefined) patch.type = input.type;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.position !== undefined) patch.position = input.position;
    if (input.content !== undefined) patch.content = input.content;
    if (input.externalUrl !== undefined) patch.externalUrl = input.externalUrl;
    if (input.fileAssetId !== undefined) patch.fileAssetId = input.fileAssetId;
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === 'published') patch.publishedAt = new Date().toISOString();
      if (input.status === 'archived') patch.archivedAt = new Date().toISOString();
    }

    const [updated] = await db
      .update(readingMaterials)
      .set(patch)
      .where(eq(readingMaterials.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'material.update',
      target: id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toSummary(updated));
  },
);

r.delete('/materials/:materialId', requireScopeGroup('materialsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'materialId');
  const row = (await db.select().from(readingMaterials).where(eq(readingMaterials.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(readingMaterials).where(eq(readingMaterials.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'material.delete',
    target: id,
  });
  return success(c, { id });
});

async function transitionStatus(
  c: Context<AppEnv>,
  next: 'published' | 'archived' | 'draft',
) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'materialId');
  const row = (await db.select().from(readingMaterials).where(eq(readingMaterials.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  if (next === 'published') patch.publishedAt = new Date().toISOString();
  if (next === 'archived') patch.archivedAt = new Date().toISOString();
  const [updated] = await db
    .update(readingMaterials)
    .set(patch)
    .where(eq(readingMaterials.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Material not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `material.${next}`,
    target: id,
  });
  return success(c, toSummary(updated));
}

r.post('/materials/:materialId/publish', requireScopeGroup('materialsWrite'), (c) =>
  transitionStatus(c, 'published'),
);
r.post('/materials/:materialId/archive', requireScopeGroup('materialsWrite'), (c) =>
  transitionStatus(c, 'archived'),
);

export default r;
