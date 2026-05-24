import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  MESSAGE_PRIORITIES,
  type MessagePriority,
  type MessageRecord,
  type MessageThreadDetail,
  type MessageThreadSummary,
  type UnreadCountResponse,
} from '@coursewise/shared';
import { messageThreads, messages, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { validateJson } from '../middleware/validate';
import { canAccessCourse } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';
import type { Db } from '../db/client';
import type { AuthenticatedUser } from '../middleware/types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const PREVIEW_LIMIT = 140;
const PRIORITY_RANK: Record<MessagePriority, number> = { normal: 0, high: 1, urgent: 2 };

const sendMessageSchema = z.object({
  recipientId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(8000),
  priority: z.enum(MESSAGE_PRIORITIES).default('normal'),
});

type SendBody = z.infer<typeof sendMessageSchema>;

/**
 * A course member is anyone who can access the course at all: admin, course
 * teacher, or enrolled student. We deliberately reuse the same predicate the
 * read-only routes use so messaging visibility matches what the user can see
 * elsewhere in the course.
 */
async function assertCourseMember(
  db: Db,
  user: AuthenticatedUser,
  courseId: string,
): Promise<void> {
  if (!(await canAccessCourse(db, user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a member of this course');
  }
}

async function isRecipientCourseMember(
  db: Db,
  courseId: string,
  recipientId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1);
  if (!row) return false;
  if (row.role === 'admin') return true;
  // Same membership predicate; canAccessCourse needs an AuthenticatedUser, so
  // synthesise a minimal one.
  return canAccessCourse(db, { id: recipientId, role: row.role } as AuthenticatedUser, courseId);
}

/** Canonicalize participant pair so participant_a_id < participant_b_id. */
function orderParticipants(
  callerId: string,
  recipientId: string,
): { a: string; b: string; callerIsA: boolean } {
  if (callerId < recipientId) return { a: callerId, b: recipientId, callerIsA: true };
  return { a: recipientId, b: callerId, callerIsA: false };
}

function deriveSubject(input: SendBody): string {
  if (input.subject && input.subject.trim()) return input.subject.trim().slice(0, 200);
  const firstLine = input.body.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return (firstLine || '(no subject)').slice(0, 200);
}

function previewOf(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length <= PREVIEW_LIMIT
    ? collapsed
    : `${collapsed.slice(0, PREVIEW_LIMIT - 1)}…`;
}

function isParticipant(
  thread: { participantAId: string; participantBId: string },
  userId: string,
): { isA: boolean; isB: boolean } {
  return {
    isA: thread.participantAId === userId,
    isB: thread.participantBId === userId,
  };
}

function toMessageRecord(row: typeof messages.$inferSelect): MessageRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    body: row.body,
    priority: (row.priority as MessagePriority) ?? 'normal',
    createdAt: row.createdAt,
    readAtByRecipient: row.readAtByRecipient ?? null,
  };
}

// POST /api/courses/:cid/messages — send a message (creates thread if needed).
r.post('/courses/:cid/messages', validateJson(sendMessageSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const cid = requireParam(c, 'cid');
  const input = c.get('validated') as SendBody;

  if (input.recipientId === auth.user.id) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Cannot send a message to yourself');
  }

  await assertCourseMember(db, auth.user, cid);
  if (!(await isRecipientCourseMember(db, cid, input.recipientId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Recipient is not a member of this course');
  }

  let threadId: string;
  let thread:
    | (typeof messageThreads.$inferSelect)
    | undefined;

  if (input.threadId) {
    [thread] = await db
      .select()
      .from(messageThreads)
      .where(eq(messageThreads.id, input.threadId))
      .limit(1);
    if (!thread || thread.courseId !== cid) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Thread not found');
    }
    const { isA, isB } = isParticipant(thread, auth.user.id);
    if (!isA && !isB) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a participant in this thread');
    }
    // Recipient must be the other participant. (Guard against a client that
    // hands a threadId from a different conversation alongside a foreign
    // recipientId.)
    const otherId = isA ? thread.participantBId : thread.participantAId;
    if (otherId !== input.recipientId) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Recipient does not match thread');
    }
    threadId = thread.id;
  } else {
    const { a, b } = orderParticipants(auth.user.id, input.recipientId);
    const [created] = await db
      .insert(messageThreads)
      .values({
        courseId: cid,
        participantAId: a,
        participantBId: b,
        subject: deriveSubject(input),
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: auth.user.id,
      })
      .returning();
    if (!created) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create thread');
    }
    thread = created;
    threadId = created.id;
  }

  const [msg] = await db
    .insert(messages)
    .values({
      threadId,
      senderId: auth.user.id,
      body: input.body.trim(),
      priority: input.priority,
    })
    .returning();
  if (!msg) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to send message');
  }

  // Touch the thread's denormalized last-message fields and clear the
  // recipient's soft-delete so a previously hidden conversation reappears
  // in their inbox.
  const recipientIsA = thread.participantAId === input.recipientId;
  await db
    .update(messageThreads)
    .set({
      lastMessageAt: msg.createdAt,
      lastMessageSenderId: auth.user.id,
      ...(recipientIsA ? { deletedByAAt: null } : { deletedByBAt: null }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messageThreads.id, threadId));

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'message.send',
    target: threadId,
    metadata: { courseId: cid, recipientId: input.recipientId, priority: input.priority },
  });

  return success(c, { threadId, message: toMessageRecord(msg) }, 201);
});

// GET /api/courses/:cid/messages/threads — list my visible threads in this course.
r.get('/courses/:cid/messages/threads', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const cid = requireParam(c, 'cid');
  await assertCourseMember(db, auth.user, cid);

  const me = auth.user.id;
  const threadRows = await db
    .select()
    .from(messageThreads)
    .where(
      and(
        eq(messageThreads.courseId, cid),
        or(eq(messageThreads.participantAId, me), eq(messageThreads.participantBId, me)),
      ),
    )
    .orderBy(desc(messageThreads.lastMessageAt));

  const visible = threadRows.filter((t) => {
    const deletedAt = t.participantAId === me ? t.deletedByAAt : t.deletedByBAt;
    if (!deletedAt) return true;
    // Show again if a newer message arrived after the soft-delete.
    return t.lastMessageAt > deletedAt;
  });

  if (visible.length === 0) {
    return success(c, { threads: [] as MessageThreadSummary[] });
  }

  const otherIds = Array.from(
    new Set(visible.map((t) => (t.participantAId === me ? t.participantBId : t.participantAId))),
  );
  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, otherIds));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const threadIds = visible.map((t) => t.id);
  const latestMsgs = await db
    .select({
      threadId: messages.threadId,
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      priority: messages.priority,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.threadId, threadIds))
    .orderBy(messages.threadId, desc(messages.createdAt));
  const latestByThread = new Map<string, (typeof latestMsgs)[number]>();
  for (const m of latestMsgs) {
    if (!latestByThread.has(m.threadId)) latestByThread.set(m.threadId, m);
  }

  // Unread messages addressed to me, per thread. Read state lives on each
  // message so a thread I haven't opened still surfaces its full count.
  const unreadRows = await db
    .select({
      threadId: messages.threadId,
      id: messages.id,
      priority: messages.priority,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.threadId, threadIds),
        isNull(messages.readAtByRecipient),
        sql`${messages.senderId} <> ${me}`,
      ),
    );
  const unreadByThread = new Map<string, { count: number; highest: MessagePriority | null }>();
  for (const u of unreadRows) {
    const cur = unreadByThread.get(u.threadId) ?? { count: 0, highest: null };
    cur.count += 1;
    const p = (u.priority as MessagePriority) ?? 'normal';
    if (cur.highest === null || PRIORITY_RANK[p] > PRIORITY_RANK[cur.highest]) cur.highest = p;
    unreadByThread.set(u.threadId, cur);
  }

  const threads: MessageThreadSummary[] = visible.map((t) => {
    const otherId = t.participantAId === me ? t.participantBId : t.participantAId;
    const other = userById.get(otherId);
    const latest = latestByThread.get(t.id);
    const unread = unreadByThread.get(t.id) ?? { count: 0, highest: null };
    return {
      threadId: t.id,
      courseId: t.courseId,
      subject: t.subject,
      otherParticipant: {
        id: otherId,
        name: other?.name ?? '',
        email: other?.email ?? '',
      },
      lastMessageAt: t.lastMessageAt,
      lastMessageSenderId: t.lastMessageSenderId ?? null,
      lastMessagePreview: latest ? previewOf(latest.body) : '',
      unreadCount: unread.count,
      highestUnreadPriority: unread.highest,
    };
  });

  // Urgent-unread threads bubble to the top, then high-unread, then normal,
  // each tier sorted by recency. JS sort is stable so the existing
  // lastMessageAt DESC order is preserved within tiers.
  threads.sort((x, y) => {
    const xr = x.highestUnreadPriority ? PRIORITY_RANK[x.highestUnreadPriority] : -1;
    const yr = y.highestUnreadPriority ? PRIORITY_RANK[y.highestUnreadPriority] : -1;
    if (xr !== yr) return yr - xr;
    return x.lastMessageAt < y.lastMessageAt ? 1 : -1;
  });

  return success(c, { threads });
});

// GET /api/courses/:cid/messages/threads/:tid — read thread, marks unread as read.
r.get('/courses/:cid/messages/threads/:tid', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const cid = requireParam(c, 'cid');
  const tid = requireParam(c, 'tid');
  await assertCourseMember(db, auth.user, cid);

  const [thread] = await db
    .select()
    .from(messageThreads)
    .where(and(eq(messageThreads.id, tid), eq(messageThreads.courseId, cid)))
    .limit(1);
  if (!thread) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Thread not found');
  const { isA, isB } = isParticipant(thread, auth.user.id);
  if (!isA && !isB) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a participant in this thread');
  }

  // Mark unread messages addressed to me as read. The HTTP Neon driver has
  // no transactions, so we do the UPDATE then SELECT separately — fine
  // since both queries are idempotent.
  const nowIso = new Date().toISOString();
  await db
    .update(messages)
    .set({ readAtByRecipient: nowIso })
    .where(
      and(
        eq(messages.threadId, tid),
        isNull(messages.readAtByRecipient),
        sql`${messages.senderId} <> ${auth.user.id}`,
      ),
    );

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, tid))
    .orderBy(asc(messages.createdAt));

  const otherId = isA ? thread.participantBId : thread.participantAId;
  const [other] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, otherId))
    .limit(1);

  const body: MessageThreadDetail = {
    threadId: thread.id,
    courseId: thread.courseId,
    subject: thread.subject,
    otherParticipant: {
      id: otherId,
      name: other?.name ?? '',
      email: other?.email ?? '',
    },
    messages: rows.map(toMessageRecord),
  };
  return success(c, body);
});

// DELETE /api/courses/:cid/messages/threads/:tid — soft-delete for me.
r.delete('/courses/:cid/messages/threads/:tid', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const cid = requireParam(c, 'cid');
  const tid = requireParam(c, 'tid');
  await assertCourseMember(db, auth.user, cid);

  const [thread] = await db
    .select()
    .from(messageThreads)
    .where(and(eq(messageThreads.id, tid), eq(messageThreads.courseId, cid)))
    .limit(1);
  if (!thread) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Thread not found');
  const { isA, isB } = isParticipant(thread, auth.user.id);
  if (!isA && !isB) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a participant in this thread');
  }

  const nowIso = new Date().toISOString();
  await db
    .update(messageThreads)
    .set({
      ...(isA ? { deletedByAAt: nowIso } : { deletedByBAt: nowIso }),
      updatedAt: nowIso,
    })
    .where(eq(messageThreads.id, tid));

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'message.thread.delete',
    target: tid,
    metadata: { courseId: cid },
  });

  return success(c, { id: tid });
});

// GET /api/messages/unread-count — total unread for the caller across courses.
r.get('/messages/unread-count', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const me = auth.user.id;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
    .where(
      and(
        isNull(messages.readAtByRecipient),
        sql`${messages.senderId} <> ${me}`,
        or(eq(messageThreads.participantAId, me), eq(messageThreads.participantBId, me)),
      ),
    );
  const total = row?.count ?? 0;
  const body: UnreadCountResponse = { total };
  return success(c, body);
});

export default r;
