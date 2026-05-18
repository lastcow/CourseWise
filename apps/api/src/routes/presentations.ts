import { Hono, type Context } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  createPresentationSchema,
  createSlideSchema,
  reorderSlidesSchema,
  updatePresentationSchema,
  updateSlideSchema,
  type CreatePresentationInput,
  type CreateSlideInput,
  type PresentationSummary,
  type ReorderSlidesInput,
  type SlideSummary,
  type UpdatePresentationInput,
  type UpdateSlideInput,
} from '@coursewise/shared';
import { modules, presentations, slides } from '../db/schema';
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

function toSummary(
  row: typeof presentations.$inferSelect,
  slideCount = 0,
): PresentationSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    publishedAt: row.publishedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    position: row.position,
    slideCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSlide(row: typeof slides.$inferSelect, redactSpeakerNotes = false): SlideSummary {
  return {
    id: row.id,
    presentationId: row.presentationId,
    position: row.position,
    title: row.title ?? null,
    content: row.content ?? null,
    speakerNotes: redactSpeakerNotes ? null : row.speakerNotes ?? null,
    layout: row.layout ?? null,
    imageAssetId: row.imageAssetId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadPresentation(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(presentations)
    .where(eq(presentations.id, id))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Presentation not found');
  return row;
}

async function ensureViewable(
  c: Context<AppEnv>,
  row: typeof presentations.$inferSelect,
): Promise<{ isStudent: boolean }> {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') return { isStudent: false };
  if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, row.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return { isStudent: false };
  }
  // student
  if (row.status !== 'published') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Presentation is not published');
  }
  if (!(await isCourseEnrolled(db, row.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
  return { isStudent: true };
}

async function getSlideCount(c: Context<AppEnv>, presentationId: string): Promise<number> {
  const db = c.get('db');
  const rows = await db
    .select({ id: slides.id })
    .from(slides)
    .where(eq(slides.presentationId, presentationId));
  return rows.length;
}

// -------- Course-scoped list / create --------

r.get(
  '/courses/:courseId/presentations',
  requireScopeGroup('presentationsRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const visibleStatuses =
      auth.user.role === 'student'
        ? (['published'] as const)
        : (['draft', 'published', 'archived'] as const);
    const rows = await db
      .select()
      .from(presentations)
      .where(
        and(
          eq(presentations.courseId, courseId),
          inArray(presentations.status, visibleStatuses as unknown as ('draft' | 'published' | 'archived')[]),
        ),
      )
      .orderBy(asc(presentations.position), asc(presentations.createdAt));

    // batch slide counts
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const rs = await db
        .select({ presentationId: slides.presentationId, c: sql<number>`count(*)::int` })
        .from(slides)
        .where(inArray(slides.presentationId, ids))
        .groupBy(slides.presentationId);
      for (const r of rs) counts.set(r.presentationId, r.c);
    }

    return success(c, rows.map((row) => toSummary(row, counts.get(row.id) ?? 0)));
  },
);

r.post(
  '/courses/:courseId/presentations',
  requireScopeGroup('presentationsWrite'),
  requireTokenCourseAccess(),
  validateJson(createPresentationSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreatePresentationInput;

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

    const [created] = await db
      .insert(presentations)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: input.description ?? null,
        position: input.position ?? 0,
        status: 'draft',
        createdById: auth.user.id,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create presentation');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'presentation.create',
      target: created.id,
      metadata: { courseId },
    });

    return success(c, toSummary(created, 0), 201);
  },
);

// -------- Single presentation --------

r.get('/presentations/:presentationId', requireScopeGroup('presentationsRead'), async (c) => {
  const id = requireParam(c, 'presentationId');
  const row = await loadPresentation(c, id);
  await ensureViewable(c, row);
  const count = await getSlideCount(c, id);
  return success(c, toSummary(row, count));
});

r.patch(
  '/presentations/:presentationId',
  requireScopeGroup('presentationsWrite'),
  validateJson(updatePresentationSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'presentationId');
    const row = await loadPresentation(c, id);
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdatePresentationInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.position !== undefined) patch.position = input.position;

    const [updated] = await db
      .update(presentations)
      .set(patch)
      .where(eq(presentations.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Presentation not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'presentation.update',
      target: id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toSummary(updated, await getSlideCount(c, id)));
  },
);

r.delete('/presentations/:presentationId', requireScopeGroup('presentationsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'presentationId');
  const row = await loadPresentation(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  // Cascade DB removes slides.
  await db.delete(presentations).where(eq(presentations.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'presentation.delete',
    target: id,
  });
  return success(c, { id });
});

async function transitionStatus(c: Context<AppEnv>, next: 'published' | 'archived' | 'draft') {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'presentationId');
  const row = await loadPresentation(c, id);
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  if (next === 'published') patch.publishedAt = new Date().toISOString();
  if (next === 'archived') patch.archivedAt = new Date().toISOString();
  const [updated] = await db
    .update(presentations)
    .set(patch)
    .where(eq(presentations.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Presentation not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `presentation.${next}`,
    target: id,
  });
  return success(c, toSummary(updated, await getSlideCount(c, id)));
}

r.post('/presentations/:presentationId/publish', requireScopeGroup('presentationsWrite'), (c) =>
  transitionStatus(c, 'published'),
);
r.post('/presentations/:presentationId/archive', requireScopeGroup('presentationsWrite'), (c) =>
  transitionStatus(c, 'archived'),
);

// -------- Slides --------

r.get('/presentations/:presentationId/slides', requireScopeGroup('presentationsRead'), async (c) => {
  const db = c.get('db');
  const id = requireParam(c, 'presentationId');
  const row = await loadPresentation(c, id);
  const { isStudent } = await ensureViewable(c, row);
  const rows = await db
    .select()
    .from(slides)
    .where(eq(slides.presentationId, id))
    .orderBy(asc(slides.position), asc(slides.createdAt));
  return success(c, rows.map((r) => toSlide(r, isStudent)));
});

r.post(
  '/presentations/:presentationId/slides',
  requireScopeGroup('presentationsWrite'),
  validateJson(createSlideSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'presentationId');
    const row = await loadPresentation(c, id);
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateSlideInput;
    const existing = await db
      .select({ position: slides.position })
      .from(slides)
      .where(eq(slides.presentationId, id))
      .orderBy(asc(slides.position));
    const nextPosition =
      existing.length === 0 ? 0 : (existing[existing.length - 1]!.position ?? 0) + 1;
    const [created] = await db
      .insert(slides)
      .values({
        presentationId: id,
        position: nextPosition,
        title: input.title ?? null,
        content: input.content ?? null,
        speakerNotes: input.speakerNotes ?? null,
        layout: input.layout ?? null,
        imageAssetId: input.imageAssetId ?? null,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create slide');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'slide.create',
      target: created.id,
      metadata: { presentationId: id, position: nextPosition },
    });
    return success(c, toSlide(created), 201);
  },
);

r.post(
  '/presentations/:presentationId/slides/reorder',
  requireScopeGroup('presentationsWrite'),
  validateJson(reorderSlidesSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'presentationId');
    const row = await loadPresentation(c, id);
    if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as ReorderSlidesInput;
    const ids = input.ids;

    // Ensure all ids belong to this presentation, and the count matches.
    const existingRows = await db
      .select({ id: slides.id })
      .from(slides)
      .where(eq(slides.presentationId, id));
    const existingIds = new Set(existingRows.map((r) => r.id));
    if (ids.length !== existingIds.size || !ids.every((slideId) => existingIds.has(slideId))) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Reorder ids must include every slide in this presentation, exactly once',
      );
    }

    // Atomic update via a single CASE expression.
    const cases = ids.map((slideId, idx) => sql`WHEN ${slideId}::uuid THEN ${idx}::int`);
    await db.execute(sql`
      UPDATE slides
      SET position = CASE id ${sql.join(cases, sql` `)} END,
          updated_at = now()
      WHERE presentation_id = ${id}::uuid
        AND id IN (${sql.join(
          ids.map((slideId) => sql`${slideId}::uuid`),
          sql`, `,
        )})
    `);

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'slide.reorder',
      target: id,
      metadata: { ids },
    });

    const rows = await db
      .select()
      .from(slides)
      .where(eq(slides.presentationId, id))
      .orderBy(asc(slides.position));
    return success(c, rows.map((r) => toSlide(r)));
  },
);

r.get('/slides/:slideId', requireScopeGroup('presentationsRead'), async (c) => {
  const db = c.get('db');
  const id = requireParam(c, 'slideId');
  const [row] = await db.select().from(slides).where(eq(slides.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Slide not found');
  const presentation = await loadPresentation(c, row.presentationId);
  const { isStudent } = await ensureViewable(c, presentation);
  return success(c, toSlide(row, isStudent));
});

r.patch(
  '/slides/:slideId',
  requireScopeGroup('presentationsWrite'),
  validateJson(updateSlideSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'slideId');
    const [row] = await db.select().from(slides).where(eq(slides.id, id)).limit(1);
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Slide not found');
    const presentation = await loadPresentation(c, row.presentationId);
    if (!(await canWriteCourse(db, auth.user, presentation.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateSlideInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.content !== undefined) patch.content = input.content;
    if (input.speakerNotes !== undefined) patch.speakerNotes = input.speakerNotes;
    if (input.layout !== undefined) patch.layout = input.layout;
    if (input.imageAssetId !== undefined) patch.imageAssetId = input.imageAssetId;
    const [updated] = await db.update(slides).set(patch).where(eq(slides.id, id)).returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Slide not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'slide.update',
      target: id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toSlide(updated));
  },
);

r.delete('/slides/:slideId', requireScopeGroup('presentationsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'slideId');
  const [row] = await db.select().from(slides).where(eq(slides.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Slide not found');
  const presentation = await loadPresentation(c, row.presentationId);
  if (!(await canWriteCourse(db, auth.user, presentation.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(slides).where(eq(slides.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'slide.delete',
    target: id,
  });
  return success(c, { id });
});

export default r;
