import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import {
  createModuleSchema,
  reorderModulesSchema,
  updateModuleSchema,
  type CreateModuleInput,
  type MeetingSlot,
  type ModuleCadence,
  type ModuleSummary,
  type ReorderModulesInput,
  type UpdateModuleInput,
} from '@coursewise/shared';
import { courses, modules } from '../db/schema';
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
    status: row.status,
    publishedAt: row.publishedAt ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    closedAt: row.closedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ----------------- Schedule window math -----------------

const PERIOD_DAYS: Record<Exclude<ModuleCadence, 'session'>, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};
const DAY_MS = 86_400_000;

type Window = { startAt: string; endAt: string };

/** Nth class session from the course start: enumerate meeting-slot
 *  occurrences chronologically (UTC wall-clock). */
function sessionWindows(startDate: string, slots: MeetingSlot[], count: number): Window[] {
  const windows: Window[] = [];
  const base = new Date(startDate);
  base.setUTCHours(0, 0, 0, 0);
  // Safety cap: two years of days is far beyond any realistic course.
  for (let d = 0; windows.length < count && d < 800; d++) {
    const day = new Date(base.getTime() + d * DAY_MS);
    const todays = slots
      .filter((s) => s.day === day.getUTCDay())
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const s of todays) {
      if (windows.length >= count) break;
      const date = day.toISOString().slice(0, 10);
      windows.push({
        startAt: `${date}T${s.start}:00.000Z`,
        endAt: `${date}T${s.end}:00.000Z`,
      });
    }
  }
  return windows;
}

/** Nth fixed period from the course start, end clamped to the course end. */
function periodWindows(
  startDate: string,
  cadence: Exclude<ModuleCadence, 'session'>,
  count: number,
  endDate: string | null,
): Window[] {
  const periodMs = PERIOD_DAYS[cadence] * DAY_MS;
  const base = new Date(startDate);
  base.setUTCHours(0, 0, 0, 0);
  const courseEnd = endDate ? new Date(endDate).getTime() : null;
  const windows: Window[] = [];
  for (let i = 0; i < count; i++) {
    const start = base.getTime() + i * periodMs;
    let end = start + periodMs;
    if (courseEnd !== null && end > courseEnd && courseEnd > start) end = courseEnd;
    windows.push({
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
    });
  }
  return windows;
}

/** Compute `count` module windows from the course schedule, or throw 409 when
 *  the course isn't configured for schedule-driven modules. */
function computeWindows(
  course: { startDate: string | null; endDate: string | null; moduleCadence: ModuleCadence | null; meetingSlotsJson: unknown },
  count: number,
): Window[] {
  if (!course.moduleCadence || !course.startDate) {
    throw new ApiException(
      409,
      ERROR_CODES.CONFLICT,
      'Course needs a start date and a module cadence before modules can be aligned',
    );
  }
  if (course.moduleCadence === 'session') {
    const slots = (course.meetingSlotsJson as MeetingSlot[] | null) ?? [];
    if (slots.length === 0) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'Per-session cadence needs at least one meeting time',
      );
    }
    return sessionWindows(course.startDate, slots, count);
  }
  return periodWindows(course.startDate, course.moduleCadence, count, course.endDate);
}

async function loadCourse(c: Context<AppEnv>, courseId: string) {
  const db = c.get('db');
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
  return course;
}

r.get(
  '/courses/:courseId/modules',
  requireScopeGroup('coursesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    // Students only see published modules; teachers/admins see drafts too.
    const where =
      auth.user.role === 'student'
        ? and(eq(modules.courseId, courseId), eq(modules.status, 'published'))
        : eq(modules.courseId, courseId);
    const rows = await db
      .select()
      .from(modules)
      .where(where)
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

    // No explicit window given: auto-assign the next slot from the course
    // schedule when one is configured (best-effort — a course without a
    // cadence just creates an unscheduled module).
    let autoWindow: Window | undefined;
    if (input.startAt === undefined && input.endAt === undefined) {
      const course = await loadCourse(c, courseId);
      if (course.moduleCadence && course.startDate) {
        try {
          autoWindow = computeWindows(course, next + 1)[next];
        } catch {
          autoWindow = undefined;
        }
      }
    }

    const [created] = await db
      .insert(modules)
      .values({
        courseId,
        title: input.title,
        description: input.description ?? null,
        position: next,
        startAt: input.startAt ?? autoWindow?.startAt ?? null,
        endAt: input.endAt ?? autoWindow?.endAt ?? null,
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

// Recompute and save every module's window from the course schedule, by
// position. An explicit action (not automatic on reorder/edit) so manual
// window adjustments are never silently clobbered.
r.post(
  '/courses/:courseId/modules/align',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const course = await loadCourse(c, courseId);
    const rows = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position), asc(modules.createdAt));
    if (rows.length === 0) return success(c, []);
    const windows = computeWindows(course, rows.length);

    // Single CASE WHEN statement (Neon HTTP driver has no transactions).
    const startCases = rows.map((m, i) => sql`WHEN ${m.id}::uuid THEN ${windows[i]!.startAt}::timestamptz`);
    const endCases = rows.map((m, i) => sql`WHEN ${m.id}::uuid THEN ${windows[i]!.endAt}::timestamptz`);
    await db.execute(sql`
      UPDATE modules
      SET start_at = CASE id ${sql.join(startCases, sql` `)} END,
          end_at = CASE id ${sql.join(endCases, sql` `)} END,
          updated_at = now()
      WHERE course_id = ${courseId}::uuid
    `);

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'modules.align',
      target: courseId,
      metadata: { cadence: course.moduleCadence, count: rows.length },
    });

    const updated = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position), asc(modules.createdAt));
    return success(c, updated.map(toSummary));
  },
);

r.get('/modules/:moduleId', requireScopeGroup('coursesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const moduleId = requireParam(c, 'moduleId');
  const [row] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
  // Unpublished modules don't exist as far as students are concerned.
  if (auth.user.role === 'student' && row.status !== 'published') {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
  }
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
    if (input.startAt !== undefined) patch.startAt = input.startAt;
    if (input.endAt !== undefined) patch.endAt = input.endAt;
    // Manual close grays the module out in the UI; reopen clears it.
    if (input.closed !== undefined) {
      patch.closedAt = input.closed ? new Date().toISOString() : null;
    }

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

// Publish / unpublish — same lifecycle as other course items: students only
// see published modules.
async function transitionModule(c: Context<AppEnv>, next: 'published' | 'draft') {
  const auth = c.get('auth');
  const db = c.get('db');
  const moduleId = requireParam(c, 'moduleId');
  const [row] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Module not found');
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next, updatedAt: now };
  if (next === 'published') patch.publishedAt = now;
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
    action: next === 'published' ? 'module.publish' : 'module.unpublish',
    target: moduleId,
  });
  return success(c, toSummary(updated));
}

r.post('/modules/:moduleId/publish', requireScopeGroup('coursesWrite'), (c) =>
  transitionModule(c, 'published'),
);
r.post('/modules/:moduleId/unpublish', requireScopeGroup('coursesWrite'), (c) =>
  transitionModule(c, 'draft'),
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
