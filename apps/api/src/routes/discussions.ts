import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  createDiscussionPostSchema,
  createDiscussionTopicSchema,
  gradeDiscussionSchema,
  replyDiscussionPostSchema,
  updateDiscussionPostSchema,
  updateDiscussionTopicSchema,
  type CreateDiscussionPostInput,
  type CreateDiscussionTopicInput,
  type DiscussionGradeRow,
  type DiscussionPostSummary,
  type DiscussionTopicSummary,
  type GradeDiscussionInput,
  type ReplyDiscussionPostInput,
  type UpdateDiscussionPostInput,
  type UpdateDiscussionTopicInput,
  type UserRole,
} from '@coursewise/shared';
import {
  discussionGrades,
  discussionPosts,
  discussionTopics,
  enrollments,
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
import { clampScore } from '../services/submissions';
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

function toTopic(
  row: typeof discussionTopics.$inferSelect,
  postCount?: number,
): DiscussionTopicSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId ?? null,
    groupId: row.groupId ?? null,
    title: row.title,
    description: row.description ?? row.prompt ?? null,
    status: row.status,
    isGraded: row.isGraded,
    isPinned: row.isPinned,
    maxScore: num(row.maxScore),
    publishedAt: row.publishedAt ?? null,
    archivedAt: row.archivedAt ?? null,
    postCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPost(
  row: typeof discussionPosts.$inferSelect,
  author: { id: string; name: string; role: UserRole },
): DiscussionPostSummary {
  return {
    id: row.id,
    topicId: row.topicId,
    parentId: row.parentId ?? null,
    content: row.isDeleted ? null : row.content,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt ?? null,
    author,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadTopic(c: Context<AppEnv>, id: string) {
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(discussionTopics)
    .where(eq(discussionTopics.id, id))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Discussion topic not found');
  return row;
}

async function ensureTopicViewable(
  c: Context<AppEnv>,
  topic: typeof discussionTopics.$inferSelect,
): Promise<void> {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') return;
  if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, topic.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return;
  }
  if (topic.status !== 'published') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Topic is not published');
  }
  if (!(await isCourseEnrolled(db, topic.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
}

// -------- Topics --------

r.get(
  '/courses/:courseId/discussion-topics',
  requireScopeGroup('discussionsRead'),
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
      .from(discussionTopics)
      .where(
        and(
          eq(discussionTopics.courseId, courseId),
          inArray(
            discussionTopics.status,
            visibleStatuses as unknown as ('draft' | 'published' | 'archived')[],
          ),
        ),
      )
      .orderBy(desc(discussionTopics.isPinned), desc(discussionTopics.updatedAt));

    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const rs = await db
        .select({ topicId: discussionPosts.topicId, c: sql<number>`count(*)::int` })
        .from(discussionPosts)
        .where(and(inArray(discussionPosts.topicId, ids), eq(discussionPosts.isDeleted, false)))
        .groupBy(discussionPosts.topicId);
      for (const r of rs) counts.set(r.topicId, r.c);
    }
    return success(c, rows.map((row) => toTopic(row, counts.get(row.id) ?? 0)));
  },
);

r.post(
  '/courses/:courseId/discussion-topics',
  requireScopeGroup('discussionsWrite'),
  requireTokenCourseAccess(),
  validateJson(createDiscussionTopicSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateDiscussionTopicInput;
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
    if (input.isGraded && (input.maxScore == null || input.maxScore <= 0)) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Graded topics require a positive maxScore');
    }
    const [created] = await db
      .insert(discussionTopics)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: input.description ?? null,
        prompt: input.description ?? null,
        isGraded: input.isGraded ?? false,
        isPinned: input.isPinned ?? false,
        maxScore: input.maxScore != null ? input.maxScore.toString() : null,
        status: 'draft',
        createdById: auth.user.id,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create topic');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'discussion.create_topic',
      target: created.id,
      metadata: { courseId, isGraded: created.isGraded },
    });
    return success(c, toTopic(created, 0), 201);
  },
);

r.get('/discussion-topics/:topicId', requireScopeGroup('discussionsRead'), async (c) => {
  const id = requireParam(c, 'topicId');
  const topic = await loadTopic(c, id);
  await ensureTopicViewable(c, topic);
  const db = c.get('db');
  const countRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(discussionPosts)
    .where(and(eq(discussionPosts.topicId, id), eq(discussionPosts.isDeleted, false)));
  return success(c, toTopic(topic, countRows[0]?.c ?? 0));
});

r.patch(
  '/discussion-topics/:topicId',
  requireScopeGroup('discussionsWrite'),
  validateJson(updateDiscussionTopicSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'topicId');
    const topic = await loadTopic(c, id);
    if (!(await canWriteCourse(db, auth.user, topic.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateDiscussionTopicInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) {
      patch.description = input.description;
      patch.prompt = input.description;
    }
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.isGraded !== undefined) patch.isGraded = input.isGraded;
    if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
    if (input.maxScore !== undefined) {
      patch.maxScore = input.maxScore === null ? null : input.maxScore.toString();
    }
    const [updated] = await db
      .update(discussionTopics)
      .set(patch)
      .where(eq(discussionTopics.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Topic not found');
    return success(c, toTopic(updated));
  },
);

r.delete('/discussion-topics/:topicId', requireScopeGroup('discussionsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'topicId');
  const topic = await loadTopic(c, id);
  if (!(await canWriteCourse(db, auth.user, topic.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  await db.delete(discussionTopics).where(eq(discussionTopics.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'discussion.delete_topic',
    target: id,
  });
  return success(c, { id });
});

async function transitionTopic(c: Context<AppEnv>, next: 'published' | 'archived') {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'topicId');
  const topic = await loadTopic(c, id);
  if (!(await canWriteCourse(db, auth.user, topic.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const patch: Record<string, unknown> = { status: next, updatedAt: new Date().toISOString() };
  if (next === 'published') patch.publishedAt = new Date().toISOString();
  if (next === 'archived') patch.archivedAt = new Date().toISOString();
  const [updated] = await db
    .update(discussionTopics)
    .set(patch)
    .where(eq(discussionTopics.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Topic not found');
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: `discussion.${next}_topic`,
    target: id,
  });
  return success(c, toTopic(updated));
}

r.post('/discussion-topics/:topicId/publish', requireScopeGroup('discussionsWrite'), (c) =>
  transitionTopic(c, 'published'),
);
r.post('/discussion-topics/:topicId/archive', requireScopeGroup('discussionsWrite'), (c) =>
  transitionTopic(c, 'archived'),
);

async function setPin(c: Context<AppEnv>, pinned: boolean) {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'topicId');
  const topic = await loadTopic(c, id);
  if (!(await canWriteCourse(db, auth.user, topic.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const [updated] = await db
    .update(discussionTopics)
    .set({ isPinned: pinned, updatedAt: new Date().toISOString() })
    .where(eq(discussionTopics.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Topic not found');
  return success(c, toTopic(updated));
}

r.post('/discussion-topics/:topicId/pin', requireScopeGroup('discussionsWrite'), (c) => setPin(c, true));
r.post('/discussion-topics/:topicId/unpin', requireScopeGroup('discussionsWrite'), (c) => setPin(c, false));

// -------- Posts --------

async function canPostOnTopic(
  c: Context<AppEnv>,
  topic: typeof discussionTopics.$inferSelect,
): Promise<void> {
  const auth = c.get('auth');
  const db = c.get('db');
  if (auth.user.role === 'admin') return;
  if (auth.user.role === 'teacher') {
    if (!(await isCourseTeacher(db, topic.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return;
  }
  // student
  if (topic.status !== 'published') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot post on a draft topic');
  }
  if (!(await isCourseEnrolled(db, topic.courseId, auth.user.id))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
  }
}

r.get('/discussion-topics/:topicId/posts', requireScopeGroup('discussionsRead'), async (c) => {
  const db = c.get('db');
  const id = requireParam(c, 'topicId');
  const topic = await loadTopic(c, id);
  await ensureTopicViewable(c, topic);
  const rows = await db
    .select({
      p: discussionPosts,
      author: { id: users.id, name: users.name, role: users.role },
    })
    .from(discussionPosts)
    .innerJoin(users, eq(discussionPosts.authorId, users.id))
    .where(eq(discussionPosts.topicId, id))
    .orderBy(asc(discussionPosts.createdAt));
  return success(c, rows.map(({ p, author }) => toPost(p, author)));
});

async function insertPost(
  c: Context<AppEnv>,
  topicId: string,
  content: string,
  parentPostId: string | null | undefined,
) {
  const auth = c.get('auth');
  const db = c.get('db');
  const topic = await loadTopic(c, topicId);
  await canPostOnTopic(c, topic);

  if (parentPostId) {
    const [parent] = await db
      .select()
      .from(discussionPosts)
      .where(eq(discussionPosts.id, parentPostId))
      .limit(1);
    if (!parent || parent.topicId !== topicId) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'parentPostId must belong to this topic');
    }
  }

  const [created] = await db
    .insert(discussionPosts)
    .values({
      topicId,
      authorId: auth.user.id,
      parentId: parentPostId ?? null,
      content,
      isDeleted: false,
    })
    .returning();
  if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create post');

  const author = { id: auth.user.id, name: auth.user.name, role: auth.user.role };
  return created
    ? toPost(created, author)
    : (null as never);
}

r.post(
  '/discussion-topics/:topicId/posts',
  requireScopeGroup('discussionsWrite'),
  validateJson(createDiscussionPostSchema),
  async (c) => {
    const id = requireParam(c, 'topicId');
    const input = c.get('validated') as CreateDiscussionPostInput;
    const out = await insertPost(c, id, input.content, input.parentPostId ?? null);
    return success(c, out, 201);
  },
);

r.get('/discussion-posts/:postId', requireScopeGroup('discussionsRead'), async (c) => {
  const db = c.get('db');
  const id = requireParam(c, 'postId');
  const rows = await db
    .select({ p: discussionPosts, author: { id: users.id, name: users.name, role: users.role } })
    .from(discussionPosts)
    .innerJoin(users, eq(discussionPosts.authorId, users.id))
    .where(eq(discussionPosts.id, id))
    .limit(1);
  if (rows.length === 0) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Post not found');
  const { p, author } = rows[0]!;
  const topic = await loadTopic(c, p.topicId);
  await ensureTopicViewable(c, topic);
  return success(c, toPost(p, author));
});

r.patch(
  '/discussion-posts/:postId',
  requireScopeGroup('discussionsWrite'),
  validateJson(updateDiscussionPostSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'postId');
    const [post] = await db
      .select()
      .from(discussionPosts)
      .where(eq(discussionPosts.id, id))
      .limit(1);
    if (!post) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Post not found');
    if (post.isDeleted) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Cannot edit a deleted post');
    }
    const topic = await loadTopic(c, post.topicId);
    const isAuthor = post.authorId === auth.user.id;
    const isCourseStaff =
      auth.user.role === 'admin' ||
      (auth.user.role === 'teacher' && (await isCourseTeacher(db, topic.courseId, auth.user.id)));
    if (!isAuthor && !isCourseStaff) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the author or course staff can edit');
    }
    const input = c.get('validated') as UpdateDiscussionPostInput;
    const [updated] = await db
      .update(discussionPosts)
      .set({ content: input.content, updatedAt: new Date().toISOString() })
      .where(eq(discussionPosts.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Post not found');
    const [author] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, updated.authorId))
      .limit(1);
    return success(c, toPost(updated, author ?? { id: updated.authorId, name: '', role: 'student' }));
  },
);

r.delete('/discussion-posts/:postId', requireScopeGroup('discussionsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'postId');
  const [post] = await db.select().from(discussionPosts).where(eq(discussionPosts.id, id)).limit(1);
  if (!post) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Post not found');
  const topic = await loadTopic(c, post.topicId);
  const isAuthor = post.authorId === auth.user.id;
  const isCourseStaff =
    auth.user.role === 'admin' ||
    (auth.user.role === 'teacher' && (await isCourseTeacher(db, topic.courseId, auth.user.id)));
  if (!isAuthor && !isCourseStaff) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the author or course staff can delete');
  }
  const now = new Date().toISOString();
  await db
    .update(discussionPosts)
    .set({ isDeleted: true, deletedAt: now, content: null, updatedAt: now })
    .where(eq(discussionPosts.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'discussion.delete_post',
    target: id,
  });
  return success(c, { id });
});

r.post(
  '/discussion-posts/:postId/replies',
  requireScopeGroup('discussionsWrite'),
  validateJson(replyDiscussionPostSchema),
  async (c) => {
    const db = c.get('db');
    const id = requireParam(c, 'postId');
    const [parent] = await db
      .select()
      .from(discussionPosts)
      .where(eq(discussionPosts.id, id))
      .limit(1);
    if (!parent) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Parent post not found');
    const input = c.get('validated') as ReplyDiscussionPostInput;
    const out = await insertPost(c, parent.topicId, input.content, id);
    return success(c, out, 201);
  },
);

// -------- Grades --------

r.get(
  '/discussion-topics/:topicId/grades',
  requireScopeGroup('gradesRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'topicId');
    const topic = await loadTopic(c, id);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list discussion grades');
    }
    if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, topic.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    const enrolled = await db
      .select({
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(and(eq(enrollments.courseId, topic.courseId), eq(enrollments.status, 'enrolled')))
      .orderBy(asc(users.name));

    const grades = await db
      .select()
      .from(discussionGrades)
      .where(eq(discussionGrades.topicId, id));
    const gradeMap = new Map(grades.map((g) => [g.studentId, g]));

    const postCounts = await db
      .select({ studentId: discussionPosts.authorId, c: sql<number>`count(*)::int` })
      .from(discussionPosts)
      .where(and(eq(discussionPosts.topicId, id), eq(discussionPosts.isDeleted, false)))
      .groupBy(discussionPosts.authorId);
    const postMap = new Map(postCounts.map((p) => [p.studentId, p.c]));

    const out: DiscussionGradeRow[] = enrolled.map((e) => {
      const g = gradeMap.get(e.studentId);
      return {
        studentId: e.studentId,
        studentName: e.studentName,
        studentEmail: e.studentEmail,
        postCount: postMap.get(e.studentId) ?? 0,
        score: g ? num(g.score) : null,
        feedback: g?.feedback ?? null,
        gradedAt: g?.gradedAt ?? null,
      };
    });
    return success(c, out);
  },
);

r.patch(
  '/discussion-topics/:topicId/grades/:studentId',
  requireScopeGroup('gradesWrite'),
  validateJson(gradeDiscussionSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'topicId');
    const studentId = requireParam(c, 'studentId');
    const topic = await loadTopic(c, id);
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot grade discussions');
    }
    if (auth.user.role === 'teacher' && !(await isCourseTeacher(db, topic.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    if (!topic.isGraded) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Topic is not graded');
    }
    const max = num(topic.maxScore);
    if (max == null) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Topic has no maxScore');
    }
    const input = c.get('validated') as GradeDiscussionInput;
    const clamped = clampScore(input.score, max);
    const now = new Date().toISOString();

    const existing = (
      await db
        .select()
        .from(discussionGrades)
        .where(
          and(eq(discussionGrades.topicId, id), eq(discussionGrades.studentId, studentId)),
        )
        .limit(1)
    )[0];
    let result;
    if (existing) {
      const [updated] = await db
        .update(discussionGrades)
        .set({
          score: clamped.toString(),
          feedback: input.feedback ?? null,
          gradedById: auth.user.id,
          gradedAt: now,
          updatedAt: now,
        })
        .where(eq(discussionGrades.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(discussionGrades)
        .values({
          topicId: id,
          studentId,
          score: clamped.toString(),
          feedback: input.feedback ?? null,
          gradedById: auth.user.id,
          gradedAt: now,
        })
        .returning();
      result = inserted;
    }
    if (!result) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to upsert grade');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'discussion.grade',
      target: id,
      metadata: { studentId, score: clamped },
    });
    return success(c, {
      topicId: id,
      studentId,
      score: clamped,
      feedback: result.feedback ?? null,
      gradedAt: result.gradedAt,
    });
  },
);

export default r;
