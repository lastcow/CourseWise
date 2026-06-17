import { Hono, type Context } from 'hono';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  announcementReactionSchema,
  createAnnouncementCommentSchema,
  createAnnouncementSchema,
  pinAnnouncementSchema,
  scheduleAnnouncementSchema,
  updateAnnouncementSchema,
  type AnnouncementAttachment,
  type AnnouncementAudience,
  type AnnouncementComment,
  type AnnouncementReactionInput,
  type AnnouncementStatus,
  type AnnouncementSummary,
  type CreateAnnouncementCommentInput,
  type CreateAnnouncementInput,
  type PinAnnouncementInput,
  type ReactionSummary,
  type ScheduleAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  announcementAttachments,
  announcementComments,
  announcementReactions,
  announcementReads,
  announcementTargets,
  announcements,
  enrollments,
  fileAssets,
  groupMemberships,
  groupSets,
  groups,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireCourseAccess, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import { publishAnnouncement } from '../services/announcements/publish';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

type AnnouncementRow = typeof announcements.$inferSelect;
type Viewer = { id: string; role: 'admin' | 'teacher' | 'student' };

/** True when the student is a member of any group this announcement targets. */
async function studentInTargetGroup(db: Db, announcementId: string, userId: string): Promise<boolean> {
  const [hit] = await db
    .select({ id: announcementTargets.id })
    .from(announcementTargets)
    .innerJoin(groupMemberships, eq(groupMemberships.groupId, announcementTargets.groupId))
    .where(
      and(
        eq(announcementTargets.announcementId, announcementId),
        eq(groupMemberships.studentId, userId),
      ),
    )
    .limit(1);
  return !!hit;
}

async function canViewAnnouncement(db: Db, user: Viewer, row: AnnouncementRow): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, row.courseId, user.id);
  if (row.status !== 'published') return false;
  if (!(await isCourseEnrolled(db, row.courseId, user.id))) return false;
  if (row.audience === 'course') return true;
  return studentInTargetGroup(db, row.id, user.id);
}

/** Audience size: all enrolled (course) or distinct members of target groups. */
async function audienceCountFor(db: Db, row: AnnouncementRow): Promise<number> {
  if (row.audience === 'course') {
    const [c] = await db
      .select({ c: count() })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, row.courseId), eq(enrollments.status, 'enrolled')));
    return Number(c?.c ?? 0);
  }
  const [c] = await db
    .select({ c: sql<number>`count(distinct ${groupMemberships.studentId})` })
    .from(announcementTargets)
    .innerJoin(groupMemberships, eq(groupMemberships.groupId, announcementTargets.groupId))
    .where(eq(announcementTargets.announcementId, row.id));
  return Number(c?.c ?? 0);
}

async function loadTargetGroupIds(db: Db, announcementId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: announcementTargets.groupId })
    .from(announcementTargets)
    .where(eq(announcementTargets.announcementId, announcementId));
  return rows.map((row) => row.groupId);
}

async function loadAttachments(db: Db, announcementId: string): Promise<AnnouncementAttachment[]> {
  const rows = await db
    .select({
      fileAssetId: announcementAttachments.fileAssetId,
      fileName: fileAssets.originalFilename,
      contentType: fileAssets.contentType,
      sizeBytes: fileAssets.sizeBytes,
    })
    .from(announcementAttachments)
    .leftJoin(fileAssets, eq(fileAssets.id, announcementAttachments.fileAssetId))
    .where(eq(announcementAttachments.announcementId, announcementId))
    .orderBy(asc(announcementAttachments.position));
  return rows
    .filter((row): row is typeof row & { fileAssetId: string } => !!row.fileAssetId)
    .map((row) => ({
      fileAssetId: row.fileAssetId,
      fileName: row.fileName ?? 'attachment',
      contentType: row.contentType ?? null,
      sizeBytes: row.sizeBytes ?? null,
    }));
}

/** Collapse raw reaction rows into per-emoji summaries from the viewer's POV. */
function summarizeReactions(
  rows: { emoji: string; userId: string }[],
  viewerId: string,
): ReactionSummary[] {
  const map = new Map<string, { count: number; reacted: boolean }>();
  for (const row of rows) {
    const cur = map.get(row.emoji) ?? { count: 0, reacted: false };
    cur.count += 1;
    if (row.userId === viewerId) cur.reacted = true;
    map.set(row.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, count: v.count, reacted: v.reacted }));
}

async function announcementReactionsFor(
  db: Db,
  announcementId: string,
  viewerId: string,
): Promise<ReactionSummary[]> {
  const rows = await db
    .select({ emoji: announcementReactions.emoji, userId: announcementReactions.userId })
    .from(announcementReactions)
    .where(eq(announcementReactions.announcementId, announcementId));
  return summarizeReactions(rows, viewerId);
}

async function commentCountFor(db: Db, announcementId: string): Promise<number> {
  const [c] = await db
    .select({ c: count() })
    .from(announcementComments)
    .where(
      and(
        eq(announcementComments.announcementId, announcementId),
        isNull(announcementComments.deletedAt),
      ),
    );
  return Number(c?.c ?? 0);
}

/** Single-announcement summary (used by mutation responses). */
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
  const [targetGroupIds, attachments, reactions, commentCount] = await Promise.all([
    loadTargetGroupIds(db, row.id),
    loadAttachments(db, row.id),
    announcementReactionsFor(db, row.id, viewerId),
    commentCountFor(db, row.id),
  ]);
  let readCount: number | undefined;
  let audienceCount: number | undefined;
  if (isTeacherView) {
    const [rc] = await db
      .select({ c: count() })
      .from(announcementReads)
      .where(eq(announcementReads.announcementId, row.id));
    readCount = Number(rc?.c ?? 0);
    audienceCount = await audienceCountFor(db, row);
  }
  return {
    id: row.id,
    courseId: row.courseId,
    authorId: row.authorId ?? null,
    authorName: author?.name ?? null,
    title: row.title,
    body: row.body,
    status: row.status,
    pinned: row.pinned,
    audience: row.audience,
    targetGroupIds,
    attachments,
    commentCount,
    reactions,
    publishAt: row.publishAt ?? null,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isRead: !!read,
    readCount,
    audienceCount,
  };
}

/**
 * Validate target group ids all belong to the course; returns the validated
 * ids (deduped). Throws 400 on a stray group.
 */
async function validateTargetGroups(db: Db, courseId: string, groupIds: string[]): Promise<string[]> {
  const unique = [...new Set(groupIds)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .innerJoin(groupSets, eq(groupSets.id, groups.groupSetId))
    .where(and(inArray(groups.id, unique), eq(groupSets.courseId, courseId)));
  if (rows.length !== unique.length) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'A target group is not in this course');
  }
  return unique;
}

/** Validate attachment file assets (ready + same course) and return ordered ids. */
async function validateAttachments(db: Db, courseId: string, fileIds: string[]): Promise<string[]> {
  const unique = [...new Set(fileIds)];
  for (const id of unique) {
    const fa = (await db.select().from(fileAssets).where(eq(fileAssets.id, id)).limit(1))[0];
    if (!fa) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'fileAssetId not found');
    if (fa.courseId && fa.courseId !== courseId) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'fileAsset belongs to a different course');
    }
    if (fa.status !== 'ready') {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'fileAsset must be in READY state');
    }
  }
  return unique;
}

async function setTargets(db: Db, announcementId: string, groupIds: string[]): Promise<void> {
  await db.delete(announcementTargets).where(eq(announcementTargets.announcementId, announcementId));
  if (groupIds.length) {
    await db
      .insert(announcementTargets)
      .values(groupIds.map((groupId) => ({ announcementId, groupId })));
  }
}

async function setAttachments(db: Db, announcementId: string, fileIds: string[]): Promise<void> {
  await db
    .delete(announcementAttachments)
    .where(eq(announcementAttachments.announcementId, announcementId));
  if (fileIds.length) {
    await db
      .insert(announcementAttachments)
      .values(fileIds.map((fileAssetId, position) => ({ announcementId, fileAssetId, position })));
    await db
      .update(fileAssets)
      .set({ relatedType: 'announcement', relatedId: announcementId, updatedAt: new Date().toISOString() })
      .where(inArray(fileAssets.id, fileIds));
  }
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
        pinned: announcements.pinned,
        audience: announcements.audience,
        publishAt: announcements.publishAt,
        publishedAt: announcements.publishedAt,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.authorId))
      .where(where)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt));

    const ids = rows.map((row) => row.id);

    // Batch-load targets + attachments for the listed announcements.
    const targetRows = ids.length
      ? await db
          .select({ aId: announcementTargets.announcementId, groupId: announcementTargets.groupId })
          .from(announcementTargets)
          .where(inArray(announcementTargets.announcementId, ids))
      : [];
    const targetsByAnnouncement = new Map<string, string[]>();
    for (const row of targetRows) {
      const list = targetsByAnnouncement.get(row.aId) ?? [];
      list.push(row.groupId);
      targetsByAnnouncement.set(row.aId, list);
    }

    const attachmentRows = ids.length
      ? await db
          .select({
            aId: announcementAttachments.announcementId,
            fileAssetId: announcementAttachments.fileAssetId,
            position: announcementAttachments.position,
            fileName: fileAssets.originalFilename,
            contentType: fileAssets.contentType,
            sizeBytes: fileAssets.sizeBytes,
          })
          .from(announcementAttachments)
          .leftJoin(fileAssets, eq(fileAssets.id, announcementAttachments.fileAssetId))
          .where(inArray(announcementAttachments.announcementId, ids))
          .orderBy(asc(announcementAttachments.position))
      : [];
    const attachmentsByAnnouncement = new Map<string, AnnouncementAttachment[]>();
    for (const row of attachmentRows) {
      if (!row.fileAssetId) continue;
      const list = attachmentsByAnnouncement.get(row.aId) ?? [];
      list.push({
        fileAssetId: row.fileAssetId,
        fileName: row.fileName ?? 'attachment',
        contentType: row.contentType ?? null,
        sizeBytes: row.sizeBytes ?? null,
      });
      attachmentsByAnnouncement.set(row.aId, list);
    }

    // Student visibility: hide targeted announcements the caller isn't in.
    let visibleRows = rows;
    if (!isTeacherView) {
      const memberRows = await db
        .select({ groupId: groupMemberships.groupId })
        .from(groupMemberships)
        .where(eq(groupMemberships.studentId, auth.user.id));
      const myGroups = new Set(memberRows.map((row) => row.groupId));
      visibleRows = rows.filter(
        (row) =>
          row.audience === 'course' ||
          (targetsByAnnouncement.get(row.id) ?? []).some((g) => myGroups.has(g)),
      );
    }

    const visibleIds = visibleRows.map((row) => row.id);
    const myReads = visibleIds.length
      ? await db
          .select({ aId: announcementReads.announcementId })
          .from(announcementReads)
          .where(
            and(
              eq(announcementReads.userId, auth.user.id),
              inArray(announcementReads.announcementId, visibleIds),
            ),
          )
      : [];
    const readSet = new Set(myReads.map((row) => row.aId));

    let readCounts = new Map<string, number>();
    if (isTeacherView && visibleIds.length) {
      const counts = await db
        .select({ aId: announcementReads.announcementId, c: count() })
        .from(announcementReads)
        .where(inArray(announcementReads.announcementId, visibleIds))
        .groupBy(announcementReads.announcementId);
      readCounts = new Map(counts.map((row) => [row.aId, Number(row.c)]));
    }

    // Comment counts (non-deleted) + announcement-level reactions, batched.
    const commentCounts = new Map<string, number>();
    const reactionsByAnnouncement = new Map<string, ReactionSummary[]>();
    if (visibleIds.length) {
      const cc = await db
        .select({ aId: announcementComments.announcementId, c: count() })
        .from(announcementComments)
        .where(
          and(
            inArray(announcementComments.announcementId, visibleIds),
            isNull(announcementComments.deletedAt),
          ),
        )
        .groupBy(announcementComments.announcementId);
      for (const row of cc) commentCounts.set(row.aId, Number(row.c));
      const rx = await db
        .select({
          aId: announcementReactions.announcementId,
          emoji: announcementReactions.emoji,
          userId: announcementReactions.userId,
        })
        .from(announcementReactions)
        .where(inArray(announcementReactions.announcementId, visibleIds));
      const byAnn = new Map<string, { emoji: string; userId: string }[]>();
      for (const row of rx) {
        if (!row.aId) continue;
        const list = byAnn.get(row.aId) ?? [];
        list.push({ emoji: row.emoji, userId: row.userId });
        byAnn.set(row.aId, list);
      }
      for (const [aId, rows2] of byAnn) {
        reactionsByAnnouncement.set(aId, summarizeReactions(rows2, auth.user.id));
      }
    }

    const summaries: AnnouncementSummary[] = [];
    for (const row of visibleRows) {
      summaries.push({
        id: row.id,
        courseId: row.courseId,
        authorId: row.authorId ?? null,
        authorName: row.authorName ?? null,
        title: row.title,
        body: row.body,
        status: row.status,
        pinned: row.pinned,
        audience: row.audience,
        targetGroupIds: targetsByAnnouncement.get(row.id) ?? [],
        attachments: attachmentsByAnnouncement.get(row.id) ?? [],
        commentCount: commentCounts.get(row.id) ?? 0,
        reactions: reactionsByAnnouncement.get(row.id) ?? [],
        publishAt: row.publishAt ?? null,
        publishedAt: row.publishedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isRead: readSet.has(row.id),
        readCount: isTeacherView ? (readCounts.get(row.id) ?? 0) : undefined,
        audienceCount: isTeacherView ? await audienceCountFor(db, row) : undefined,
      });
    }
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
    const audience: AnnouncementAudience = input.audience ?? 'course';
    const targetGroupIds =
      audience === 'groups' ? await validateTargetGroups(db, courseId, input.targetGroupIds ?? []) : [];
    if (audience === 'groups' && targetGroupIds.length === 0) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Targeted announcement needs at least one group');
    }
    const attachmentIds = await validateAttachments(db, courseId, input.attachmentFileIds ?? []);

    const publish = input.publish === true;
    const scheduledAt = !publish && input.publishAt ? input.publishAt : null;
    const [inserted] = await db
      .insert(announcements)
      .values({
        courseId,
        authorId: auth.user.id,
        title: input.title,
        body: input.body,
        status: scheduledAt ? 'scheduled' : 'draft',
        audience,
        publishAt: scheduledAt,
      })
      .returning();
    if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create announcement');

    if (targetGroupIds.length) await setTargets(db, inserted.id, targetGroupIds);
    if (attachmentIds.length) await setAttachments(db, inserted.id, attachmentIds);

    // Fan out only after targets/attachments exist so the audience resolves.
    if (publish) await publishAnnouncement(db, c.env, inserted.id);

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: publish
        ? 'announcement.publish'
        : scheduledAt
          ? 'announcement.schedule'
          : 'announcement.create',
      target: inserted.id,
      metadata: { courseId, audience },
    });
    const fresh =
      (await db.select().from(announcements).where(eq(announcements.id, inserted.id)).limit(1))[0] ??
      inserted;
    return success(c, await buildSummary(db, fresh, auth.user.id, true), 201);
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
    if (input.audience !== undefined) {
      patch.audience = input.audience;
      if (input.audience === 'groups') {
        const ids = await validateTargetGroups(db, row.courseId, input.targetGroupIds ?? []);
        if (ids.length === 0) {
          throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Targeted announcement needs at least one group');
        }
        await setTargets(db, row.id, ids);
      } else {
        await setTargets(db, row.id, []);
      }
    } else if (input.targetGroupIds !== undefined && row.audience === 'groups') {
      const ids = await validateTargetGroups(db, row.courseId, input.targetGroupIds);
      await setTargets(db, row.id, ids);
    }
    if (input.attachmentFileIds !== undefined) {
      const ids = await validateAttachments(db, row.courseId, input.attachmentFileIds);
      await setAttachments(db, row.id, ids);
    }

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

r.post(
  '/announcements/:announcementId/pin',
  requireScopeGroup('announcementsWrite'),
  validateJson(pinAnnouncementSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const row = await loadWritable(c);
    const input = c.get('validated') as PinAnnouncementInput;
    const [updated] = await db
      .update(announcements)
      .set({ pinned: input.pinned, updatedAt: new Date().toISOString() })
      .where(eq(announcements.id, row.id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
    return success(c, await buildSummary(db, updated, auth.user.id, true));
  },
);

async function transition(c: Context<AppEnv>, next: 'published' | 'archived' | 'draft') {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadWritable(c);
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
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

// Publish now: flip status + fan out (rolling alert + email) to the audience.
r.post('/announcements/:announcementId/publish', requireScopeGroup('announcementsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadWritable(c);
  await publishAnnouncement(db, c.env, row.id);
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'announcement.publish',
    target: row.id,
  });
  const fresh =
    (await db.select().from(announcements).where(eq(announcements.id, row.id)).limit(1))[0] ?? row;
  return success(c, await buildSummary(db, fresh, auth.user.id, true));
});

// Schedule (or reschedule) a future publish; the cron sweep does the fan-out.
r.post(
  '/announcements/:announcementId/schedule',
  requireScopeGroup('announcementsWrite'),
  validateJson(scheduleAnnouncementSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const row = await loadWritable(c);
    const { publishAt } = c.get('validated') as ScheduleAnnouncementInput;
    const [updated] = await db
      .update(announcements)
      .set({ status: 'scheduled', publishAt, updatedAt: new Date().toISOString() })
      .where(eq(announcements.id, row.id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'announcement.schedule',
      target: row.id,
      metadata: { publishAt },
    });
    return success(c, await buildSummary(db, updated, auth.user.id, true));
  },
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

// --- Comments + reactions --------------------------------------------------

/** Load an announcement the caller may view, or throw. */
async function loadViewable(c: Context<AppEnv>): Promise<AnnouncementRow> {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'announcementId');
  const row = (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
  if (!(await canViewAnnouncement(db, auth.user, row))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this announcement');
  }
  return row;
}

async function canModerateCourse(db: Db, user: Viewer, courseId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, courseId, user.id);
  return false;
}

r.get('/announcements/:announcementId/comments', requireScopeGroup('announcementsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadViewable(c);
  const canModerate = await canModerateCourse(db, auth.user, row.courseId);

  const rows = await db
    .select({
      id: announcementComments.id,
      authorId: announcementComments.authorId,
      authorName: users.name,
      body: announcementComments.body,
      createdAt: announcementComments.createdAt,
    })
    .from(announcementComments)
    .leftJoin(users, eq(users.id, announcementComments.authorId))
    .where(
      and(
        eq(announcementComments.announcementId, row.id),
        isNull(announcementComments.deletedAt),
      ),
    )
    .orderBy(asc(announcementComments.createdAt));

  const commentIds = rows.map((row2) => row2.id);
  const reactionRows = commentIds.length
    ? await db
        .select({
          commentId: announcementReactions.commentId,
          emoji: announcementReactions.emoji,
          userId: announcementReactions.userId,
        })
        .from(announcementReactions)
        .where(inArray(announcementReactions.commentId, commentIds))
    : [];
  const byComment = new Map<string, { emoji: string; userId: string }[]>();
  for (const rr of reactionRows) {
    if (!rr.commentId) continue;
    const list = byComment.get(rr.commentId) ?? [];
    list.push({ emoji: rr.emoji, userId: rr.userId });
    byComment.set(rr.commentId, list);
  }

  const comments: AnnouncementComment[] = rows.map((row2) => ({
    id: row2.id,
    announcementId: row.id,
    authorId: row2.authorId,
    authorName: row2.authorName ?? null,
    body: row2.body,
    createdAt: row2.createdAt,
    reactions: summarizeReactions(byComment.get(row2.id) ?? [], auth.user.id),
    canDelete: canModerate || row2.authorId === auth.user.id,
  }));
  return success(c, comments);
});

r.post(
  '/announcements/:announcementId/comments',
  requireScopeGroup('announcementsRead'),
  validateJson(createAnnouncementCommentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const row = await loadViewable(c);
    const input = c.get('validated') as CreateAnnouncementCommentInput;
    const [inserted] = await db
      .insert(announcementComments)
      .values({ announcementId: row.id, authorId: auth.user.id, body: input.body })
      .returning();
    if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to add comment');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'announcement.comment.create',
      target: inserted.id,
      metadata: { announcementId: row.id },
    });
    const comment: AnnouncementComment = {
      id: inserted.id,
      announcementId: row.id,
      authorId: auth.user.id,
      authorName: auth.user.name,
      body: inserted.body,
      createdAt: inserted.createdAt,
      reactions: [],
      canDelete: true,
    };
    return success(c, comment, 201);
  },
);

r.delete('/announcements/comments/:commentId', requireScopeGroup('announcementsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const commentId = requireParam(c, 'commentId');
  const comment = (
    await db.select().from(announcementComments).where(eq(announcementComments.id, commentId)).limit(1)
  )[0];
  if (!comment || comment.deletedAt) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Comment not found');
  const ann = (
    await db.select().from(announcements).where(eq(announcements.id, comment.announcementId)).limit(1)
  )[0];
  if (!ann) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Announcement not found');
  const allowed =
    comment.authorId === auth.user.id || (await canModerateCourse(db, auth.user, ann.courseId));
  if (!allowed) throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot delete this comment');
  await db
    .update(announcementComments)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(announcementComments.id, commentId));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'announcement.comment.delete',
    target: commentId,
  });
  return success(c, { id: commentId });
});

/** Toggle a reaction on/off, returning the target's updated summary. */
r.put(
  '/announcements/:announcementId/reactions',
  requireScopeGroup('announcementsRead'),
  validateJson(announcementReactionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const row = await loadViewable(c);
    const { emoji } = c.get('validated') as AnnouncementReactionInput;
    const existing = (
      await db
        .select({ id: announcementReactions.id })
        .from(announcementReactions)
        .where(
          and(
            eq(announcementReactions.announcementId, row.id),
            isNull(announcementReactions.commentId),
            eq(announcementReactions.userId, auth.user.id),
            eq(announcementReactions.emoji, emoji),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      await db.delete(announcementReactions).where(eq(announcementReactions.id, existing.id));
    } else {
      await db
        .insert(announcementReactions)
        .values({ announcementId: row.id, userId: auth.user.id, emoji });
    }
    return success(c, { reactions: await announcementReactionsFor(db, row.id, auth.user.id) });
  },
);

r.put(
  '/announcements/comments/:commentId/reactions',
  requireScopeGroup('announcementsRead'),
  validateJson(announcementReactionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const commentId = requireParam(c, 'commentId');
    const { emoji } = c.get('validated') as AnnouncementReactionInput;
    const comment = (
      await db.select().from(announcementComments).where(eq(announcementComments.id, commentId)).limit(1)
    )[0];
    if (!comment || comment.deletedAt) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Comment not found');
    const ann = (
      await db.select().from(announcements).where(eq(announcements.id, comment.announcementId)).limit(1)
    )[0];
    if (!ann || !(await canViewAnnouncement(db, auth.user, ann))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this announcement');
    }
    const existing = (
      await db
        .select({ id: announcementReactions.id })
        .from(announcementReactions)
        .where(
          and(
            eq(announcementReactions.commentId, commentId),
            isNull(announcementReactions.announcementId),
            eq(announcementReactions.userId, auth.user.id),
            eq(announcementReactions.emoji, emoji),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      await db.delete(announcementReactions).where(eq(announcementReactions.id, existing.id));
    } else {
      await db.insert(announcementReactions).values({ commentId, userId: auth.user.id, emoji });
    }
    const rows = await db
      .select({ emoji: announcementReactions.emoji, userId: announcementReactions.userId })
      .from(announcementReactions)
      .where(eq(announcementReactions.commentId, commentId));
    return success(c, { reactions: summarizeReactions(rows, auth.user.id) });
  },
);

export default r;
