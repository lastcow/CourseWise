import { Hono, type Context } from 'hono';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type AnnouncementStatus,
  type AnnouncementSummary,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import { announcementReads, announcements, enrollments, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireCourseAccess, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

type AnnouncementRow = typeof announcements.$inferSelect;
type Viewer = { id: string; role: 'admin' | 'teacher' | 'student' };

async function canViewAnnouncement(db: Db, user: Viewer, row: AnnouncementRow): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, row.courseId, user.id);
  if (row.status !== 'published') return false;
  return isCourseEnrolled(db, row.courseId, user.id);
}

/** Number of enrolled students in a course — the announcement audience size. */
async function audienceCountFor(db: Db, courseId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')));
  return Number(row?.c ?? 0);
}

/** Build a single summary (used by the mutation responses). */
async function buildSummary(
  db: Db,
  row: AnnouncementRow,
  viewerId: string,
  isTeacherView: boolean,
): Promise<AnnouncementSummary> {
  const author = row.authorId
    ? (await db.select({ name: users.name }).from(users).where(eq(users.id, row.authorId)).limit(1))[0]
    : null;
  const read = (
    await db
      .select({ id: announcementReads.id })
      .from(announcementReads)
      .where(and(eq(announcementReads.announcementId, row.id), eq(announcementReads.userId, viewerId)))
      .limit(1)
  )[0];
  let readCount: number | undefined;
  let audienceCount: number | undefined;
  if (isTeacherView) {
    const [rc] = await db
      .select({ c: count() })
      .from(announcementReads)
      .where(eq(announcementReads.announcementId, row.id));
    readCount = Number(rc?.c ?? 0);
    audienceCount = await audienceCountFor(db, row.courseId);
  }
  return {
    id: row.id,
    courseId: row.courseId,
    authorId: row.authorId ?? null,
    authorName: author?.name ?? null,
    title: row.title,
    body: row.body,
    status: row.status,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isRead: !!read,
    readCount,
    audienceCount,
  };
}

r.get(
  '/courses/:courseId/announcements',
  requireScopeGroup('announcementsRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const isTeacherView = auth.user.role !== 'student';

    const where = isTeacherView
      ? eq(announcements.courseId, courseId)
      : and(
          eq(announcements.courseId, courseId),
          eq(announcements.status, 'published' as AnnouncementStatus),
        );
    const rows = await db
      .select({
        id: announcements.id,
        courseId: announcements.courseId,
        authorId: announcements.authorId,
        authorName: users.name,
        title: announcements.title,
        body: announcements.body,
        status: announcements.status,
        publishedAt: announcements.publishedAt,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.authorId))
      .where(where)
      .orderBy(desc(announcements.createdAt));

    const ids = rows.map((row) => row.id);
    const myReads = ids.length
      ? await db
          .select({ aId: announcementReads.announcementId })
          .from(announcementReads)
          .where(
            and(
              eq(announcementReads.userId, auth.user.id),
              inArray(announcementReads.announcementId, ids),
            ),
          )
      : [];
    const readSet = new Set(myReads.map((row) => row.aId));

    let readCounts = new Map<string, number>();
    let audienceCount: number | undefined;
    if (isTeacherView) {
      if (ids.length) {
        const counts = await db
          .select({ aId: announcementReads.announcementId, c: count() })
          .from(announcementReads)
          .where(inArray(announcementReads.announcementId, ids))
          .groupBy(announcementReads.announcementId);
        readCounts = new Map(counts.map((row) => [row.aId, Number(row.c)]));
      }
      audienceCount = await audienceCountFor(db, courseId);
    }

    const summaries: AnnouncementSummary[] = rows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      authorId: row.authorId ?? null,
      authorName: row.authorName ?? null,
      title: row.title,
      body: row.body,
      status: row.status,
      publishedAt: row.publishedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isRead: readSet.has(row.id),
      readCount: isTeacherView ? (readCounts.get(row.id) ?? 0) : undefined,
      audienceCount: isTeacherView ? audienceCount : undefined,
    }));
    return success(c, summaries);
  },
);

r.post(
  '/courses/:courseId/announcements',
  requireScopeGroup('announcementsWrite'),
  requireTokenCourseAccess(),
  validateJson(createAnnouncementSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAnnouncementInput;
    const publish = input.publish === true;
    const now = new Date().toISOString();
    const [inserted] = await db
      .insert(announcements)
      .values({
        courseId,
        authorId: auth.user.id,
        title: input.title,
        body: input.body,
        status: publish ? 'published' : 'draft',
        publishedAt: publish ? now : null,
      })
      .returning();
    if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create announcement');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: publish ? 'announcement.publish' : 'announcement.create',
      target: inserted.id,
      metadata: { courseId },
    });
    return success(c, await buildSummary(db, inserted, auth.user.id, true), 201);
  },
);

async function loadWritable(c: Context<AppEnv>): Promise<AnnouncementRow> {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'announcementId');
  const row = (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
  if (!(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  return row;
}

r.patch(
  '/announcements/:announcementId',
  requireScopeGroup('announcementsWrite'),
  validateJson(updateAnnouncementSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const row = await loadWritable(c);
    const input = c.get('validated') as UpdateAnnouncementInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    const [updated] = await db
      .update(announcements)
      .set(patch)
      .where(eq(announcements.id, row.id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'announcement.update',
      target: row.id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, await buildSummary(db, updated, auth.user.id, true));
  },
);

async function transition(c: Context<AppEnv>, next: 'published' | 'archived' | 'draft') {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadWritable(c);
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  // Stamp publishedAt on first publish; keep it on re-publish.
  if (next === 'published' && !row.publishedAt) patch.publishedAt = new Date().toISOString();
  const [updated] = await db
    .update(announcements)
    .set(patch)
    .where(eq(announcements.id, row.id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `announcement.${next}`,
    target: row.id,
  });
  return success(c, await buildSummary(db, updated, auth.user.id, true));
}

r.post('/announcements/:announcementId/publish', requireScopeGroup('announcementsWrite'), (c) =>
  transition(c, 'published'),
);
r.post('/announcements/:announcementId/archive', requireScopeGroup('announcementsWrite'), (c) =>
  transition(c, 'archived'),
);
r.post('/announcements/:announcementId/unpublish', requireScopeGroup('announcementsWrite'), (c) =>
  transition(c, 'draft'),
);

r.delete('/announcements/:announcementId', requireScopeGroup('announcementsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadWritable(c);
  await db.delete(announcements).where(eq(announcements.id, row.id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'announcement.delete',
    target: row.id,
  });
  return success(c, { id: row.id });
});

// Mark an announcement read for the calling user. Idempotent via the unique
// (announcement_id, user_id) index.
r.post('/announcements/:announcementId/read', requireScopeGroup('announcementsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'announcementId');
  const row = (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
  if (!(await canViewAnnouncement(db, auth.user, row))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this announcement');
  }
  await db
    .insert(announcementReads)
    .values({ announcementId: id, userId: auth.user.id })
    .onConflictDoNothing();
  return success(c, { ok: true });
});

export default r;
