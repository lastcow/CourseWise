import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  createRecordCorrectionRequestSchema,
  resolveRecordCorrectionRequestSchema,
  type CreateRecordCorrectionRequestInput,
  type RecordCorrectionRequestSummary,
  type RecordCorrectionStatus,
  type ResolveRecordCorrectionRequestInput,
} from '@coursewise/shared';
import { courses, recordCorrectionRequests, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canWriteCourse, isCourseEnrolled } from '../services/courseAccess';
import type { AppEnv } from '../types';

/**
 * FERPA §99.20 — students can request correction of records they believe
 * are inaccurate or misleading. Five endpoints:
 *
 *   POST   /me/record-correction-requests              — student creates
 *   GET    /me/record-correction-requests              — student lists own
 *   POST   /me/record-correction-requests/:id/withdraw — student withdraws
 *   GET    /courses/:cid/record-correction-requests    — staff queue (course-scoped)
 *   POST   /record-correction-requests/:id/resolve     — staff resolves
 */
const r = new Hono<AppEnv>();
r.use('*', requireAuth);

type RequestRow = typeof recordCorrectionRequests.$inferSelect;
type RequestWithJoins = {
  req: RequestRow;
  studentName: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  resolvedByName: string | null;
};

function toSummary(row: RequestWithJoins): RecordCorrectionRequestSummary {
  return {
    id: row.req.id,
    studentId: row.req.studentId,
    studentName: row.studentName ?? '',
    courseId: row.req.courseId ?? null,
    courseCode: row.courseCode ?? null,
    courseTitle: row.courseTitle ?? null,
    targetType: row.req.targetType,
    targetId: row.req.targetId ?? null,
    description: row.req.description,
    status: row.req.status,
    resolutionNote: row.req.resolutionNote ?? null,
    resolvedByName: row.resolvedByName ?? null,
    resolvedAt: row.req.resolvedAt ?? null,
    createdAt: row.req.createdAt,
    updatedAt: row.req.updatedAt,
  };
}

// -------- POST /me/record-correction-requests --------

r.post(
  '/me/record-correction-requests',
  validateJson(createRecordCorrectionRequestSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const input = c.get('validated') as CreateRecordCorrectionRequestInput;

    // If a course is named, the student must actually be enrolled. Admins and
    // teachers can submit corrections too (a teacher requesting amendment of
    // their own auto-recorded attendance, say) so we don't restrict by role.
    if (input.courseId) {
      if (auth.user.role === 'student') {
        if (!(await isCourseEnrolled(db, input.courseId, auth.user.id))) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
        }
      }
    }

    const [row] = await db
      .insert(recordCorrectionRequests)
      .values({
        studentId: auth.user.id,
        courseId: input.courseId ?? null,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        description: input.description,
      })
      .returning();
    if (!row) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create request');
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'correction-request.create',
      target: row.id,
      metadata: {
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        courseId: input.courseId ?? null,
      },
    });

    // Read back joined for a complete summary (cheap — one row).
    const joined = await loadWithJoins(c, [row.id]);
    return success(c, toSummary(joined[0]!), 201);
  },
);

// -------- GET /me/record-correction-requests --------

r.get('/me/record-correction-requests', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select({
      req: recordCorrectionRequests,
      studentName: users.name,
      courseCode: courses.code,
      courseTitle: courses.title,
    })
    .from(recordCorrectionRequests)
    .leftJoin(users, eq(users.id, recordCorrectionRequests.studentId))
    .leftJoin(courses, eq(courses.id, recordCorrectionRequests.courseId))
    .where(eq(recordCorrectionRequests.studentId, auth.user.id))
    .orderBy(desc(recordCorrectionRequests.createdAt));
  // Resolver name needs a second pass (different alias). For the student's
  // own list it's almost always the teacher who resolved; do it inline.
  const out = await attachResolverNames(c, rows);
  return success(c, out.map(toSummary));
});

// -------- POST /me/record-correction-requests/:id/withdraw --------

r.post('/me/record-correction-requests/:id/withdraw', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'id');
  const [row] = await db
    .select()
    .from(recordCorrectionRequests)
    .where(eq(recordCorrectionRequests.id, id))
    .limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Request not found');
  if (row.studentId !== auth.user.id) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only the requester can withdraw');
  }
  if (row.status !== 'open') {
    throw new ApiException(
      409,
      ERROR_CODES.CONFLICT,
      'Only open requests can be withdrawn',
    );
  }
  await db
    .update(recordCorrectionRequests)
    .set({
      status: 'withdrawn',
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(recordCorrectionRequests.id, id));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'correction-request.withdraw',
    target: id,
  });
  const joined = await loadWithJoins(c, [id]);
  return success(c, toSummary(joined[0]!));
});

// -------- GET /courses/:courseId/record-correction-requests --------

r.get('/courses/:courseId/record-correction-requests', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  if (!(await canWriteCourse(db, auth.user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const statusFilter = c.req.query('status') as RecordCorrectionStatus | undefined;
  const baseWhere = eq(recordCorrectionRequests.courseId, courseId);
  const where =
    statusFilter && statusFilter.length > 0
      ? and(baseWhere, eq(recordCorrectionRequests.status, statusFilter))
      : baseWhere;
  const rows = await db
    .select({
      req: recordCorrectionRequests,
      studentName: users.name,
      courseCode: courses.code,
      courseTitle: courses.title,
    })
    .from(recordCorrectionRequests)
    .leftJoin(users, eq(users.id, recordCorrectionRequests.studentId))
    .leftJoin(courses, eq(courses.id, recordCorrectionRequests.courseId))
    .where(where)
    // Open first, then most-recently created.
    .orderBy(asc(recordCorrectionRequests.status), desc(recordCorrectionRequests.createdAt));
  const out = await attachResolverNames(c, rows);
  return success(c, out.map(toSummary));
});

// -------- POST /record-correction-requests/:id/resolve --------

r.post(
  '/record-correction-requests/:id/resolve',
  validateJson(resolveRecordCorrectionRequestSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'id');
    const input = c.get('validated') as ResolveRecordCorrectionRequestInput;

    const [row] = await db
      .select()
      .from(recordCorrectionRequests)
      .where(eq(recordCorrectionRequests.id, id))
      .limit(1);
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Request not found');
    if (!row.courseId) {
      // Profile / other-typed requests with no course need admin auth — for
      // v1 only admins can resolve them. Teachers handle course-scoped only.
      if (auth.user.role !== 'admin') {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only an admin can resolve this');
      }
    } else if (!(await canWriteCourse(db, auth.user, row.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    if (row.status !== 'open') {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Request is not open');
    }

    const nowIso = new Date().toISOString();
    await db
      .update(recordCorrectionRequests)
      .set({
        status: input.status,
        resolutionNote: input.resolutionNote ?? null,
        resolvedById: auth.user.id,
        resolvedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(recordCorrectionRequests.id, id));

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action:
        input.status === 'accepted'
          ? 'correction-request.accept'
          : 'correction-request.decline',
      target: id,
      // The subject of this disclosure log row is the student whose record
      // is being amended — touches §99.32 territory because the resolution
      // note can quote student data.
      disclosedStudentIds: row.studentId,
    });

    const joined = await loadWithJoins(c, [id]);
    return success(c, toSummary(joined[0]!));
  },
);

// Helpers ---------------------------------------------------------------

async function loadWithJoins(
  c: import('hono').Context<AppEnv>,
  ids: string[],
): Promise<RequestWithJoins[]> {
  if (ids.length === 0) return [];
  const db = c.get('db');
  const rows = await db
    .select({
      req: recordCorrectionRequests,
      studentName: users.name,
      courseCode: courses.code,
      courseTitle: courses.title,
    })
    .from(recordCorrectionRequests)
    .leftJoin(users, eq(users.id, recordCorrectionRequests.studentId))
    .leftJoin(courses, eq(courses.id, recordCorrectionRequests.courseId))
    .where(inArray(recordCorrectionRequests.id, ids));
  return attachResolverNames(c, rows);
}

async function attachResolverNames(
  c: import('hono').Context<AppEnv>,
  rows: Array<{
    req: RequestRow;
    studentName: string | null;
    courseCode: string | null;
    courseTitle: string | null;
  }>,
): Promise<RequestWithJoins[]> {
  const db = c.get('db');
  const resolverIds = Array.from(
    new Set(rows.map((r) => r.req.resolvedById).filter((x): x is string => !!x)),
  );
  const resolverMap = new Map<string, string>();
  if (resolverIds.length > 0) {
    const resolvers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, resolverIds));
    for (const u of resolvers) resolverMap.set(u.id, u.name);
  }
  return rows.map((r) => ({
    ...r,
    resolvedByName: r.req.resolvedById ? resolverMap.get(r.req.resolvedById) ?? null : null,
  }));
}

export default r;
