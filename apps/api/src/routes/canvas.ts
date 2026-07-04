import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import {
  connectCanvasSchema,
  importCanvasCourseSchema,
  linkCanvasCourseSchema,
  DEFAULT_GRADING_POLICY,
  type ConnectCanvasInput,
  type ImportCanvasCourseInput,
  type LinkCanvasCourseInput,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import {
  courses,
  courseTeachers,
  lmsConnections,
  lmsCourseLinks,
  lmsSyncRuns,
  type LmsConnectionRow,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { requireParam } from '../lib/params';
import { success } from '../lib/response';
import { requireAuth, requireCourseTeacher, requireRole, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { CanvasAuthError, CanvasClient, type CanvasCourse } from '../services/lms/canvas/client';
import { decryptCanvasToken, encryptCanvasToken } from '../services/lms/canvas/tokens';
import type { AppBindings, AppEnv } from '../types';

// Canvas LMS integration (P0 token connect + P1 course import) per
// docs/plans/2026-07-04-canvas-sync-v2-import-first-design.md.
// The plaintext token exists only in-memory inside a handler; API responses
// expose tokenLast4 only.

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// Admins can connect their own Canvas token too (requireCourseTeacher already
// passes admins on the course-level routes below).
const requireTeacherOrAdmin = requireRole('teacher', 'admin');

const CONNECT_TOKEN_PURPOSE = 'coursewise';

function connectionDto(row: LmsConnectionRow) {
  return {
    id: row.id,
    baseUrl: row.baseUrl,
    externalUserId: row.externalUserId,
    externalUserName: row.externalUserName,
    tokenLast4: row.tokenLast4,
    tokenExpiresAt: row.tokenExpiresAt,
    status: row.status,
    lastValidatedAt: row.lastValidatedAt,
    createdAt: row.createdAt,
  };
}

async function loadConnection(db: Db, teacherId: string): Promise<LmsConnectionRow | null> {
  const [row] = await db
    .select()
    .from(lmsConnections)
    .where(eq(lmsConnections.teacherId, teacherId))
    .limit(1);
  return row ?? null;
}

function connectionOr404(row: LmsConnectionRow | null): LmsConnectionRow {
  if (!row) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'No Canvas connection — connect one first');
  }
  return row;
}

// A dead token is a caller-actionable state, not an auth failure of OUR API:
// record the precise kind on the connection, then 409 so the UI shows the
// "reconnect Canvas" banner instead of logging the user out.
async function withCanvas<T>(
  db: Db,
  env: AppBindings,
  connection: LmsConnectionRow,
  fn: (client: CanvasClient) => Promise<T>,
): Promise<T> {
  // Disconnected rows keep their id_map/roster history but have no ciphertext.
  if (!connection.tokenEnc) {
    throw new ApiException(
      409,
      ERROR_CODES.CONFLICT,
      'Canvas token is revoked — reconnect Canvas in Settings',
    );
  }
  const token = await decryptCanvasToken(env, connection.tokenEnc);
  const client = new CanvasClient(connection.baseUrl, token);
  try {
    return await fn(client);
  } catch (err) {
    if (err instanceof CanvasAuthError) {
      await db
        .update(lmsConnections)
        .set({ status: err.kind, updatedAt: new Date().toISOString() })
        .where(eq(lmsConnections.id, connection.id));
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        `Canvas token is ${err.kind} — reconnect Canvas in Settings`,
      );
    }
    throw err;
  }
}

function courseDto(course: CanvasCourse) {
  return {
    id: String(course.id),
    name: course.name ?? null,
    courseCode: course.course_code ?? null,
    term: course.term?.name ?? null,
    startAt: course.start_at ?? null,
    endAt: course.end_at ?? null,
    totalStudents: course.total_students ?? null,
  };
}

// --- Teacher-level: connection lifecycle ---

r.get('/lms/canvas/connection', requireTeacherOrAdmin, requireScopeGroup('canvasSync'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = await loadConnection(db, auth.user.id);
  return success(c, row ? connectionDto(row) : null);
});

r.post(
  '/lms/canvas/connect',
  requireTeacherOrAdmin,
  requireScopeGroup('canvasSync'),
  validateJson(connectCanvasSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const input = c.get('validated') as ConnectCanvasInput;
    const baseUrl = input.baseUrl.replace(/\/$/, '');

    // Validate the pasted token before storing anything.
    const probe = new CanvasClient(baseUrl, input.token);
    let self;
    try {
      self = await probe.getSelf();
    } catch (err) {
      if (err instanceof CanvasAuthError) {
        const message =
          err.kind === 'expired'
            ? 'Canvas rejected the token: expired. Generate a new token and try again.'
            : err.kind === 'revoked'
              ? 'Canvas rejected the token: revoked. Generate a new token and try again.'
              : 'Canvas rejected the token: invalid. Check that it was copied completely.';
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, message);
      }
      throw new ApiException(
        503,
        ERROR_CODES.UPSTREAM_UNAVAILABLE,
        'Could not reach the Canvas instance — check the base URL',
      );
    }

    // Heuristic expiry lookup (best-effort; endpoint/field availability varies).
    // token_hint is the only reliable discriminator; a purpose match is used
    // only when it is unambiguous (a teacher can have several tokens whose
    // purpose mentions CourseWise, e.g. staging + prod).
    let tokenExpiresAt: string | null = null;
    try {
      const tokens = await probe.listUserGeneratedTokens();
      const last4 = input.token.slice(-4);
      const byHint = tokens.filter((t) => !!t.token_hint && t.token_hint.endsWith(last4));
      const byPurpose = tokens.filter((t) =>
        (t.purpose ?? '').toLowerCase().includes(CONNECT_TOKEN_PURPOSE),
      );
      const match = byHint.length === 1 ? byHint[0] : byPurpose.length === 1 ? byPurpose[0] : null;
      tokenExpiresAt = match?.expires_at ?? null;
    } catch {
      /* unknown expiry is fine */
    }

    // Course links store externalCourseIds minted on a specific Canvas
    // instance — silently switching baseUrl would leave them pointing at the
    // wrong host. Require unlinking (or a matching URL) first.
    const previous = await loadConnection(db, auth.user.id);
    if (previous && previous.baseUrl !== baseUrl) {
      const [linked] = await db
        .select({ id: lmsCourseLinks.id })
        .from(lmsCourseLinks)
        .where(eq(lmsCourseLinks.connectionId, previous.id))
        .limit(1);
      if (linked) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'Courses are linked to the current Canvas instance — unlink them before switching the base URL',
        );
      }
    }

    const { tokenEnc, tokenLast4 } = await encryptCanvasToken(c.env, input.token);
    const now = new Date().toISOString();
    const values = {
      teacherId: auth.user.id,
      baseUrl,
      externalUserId: String(self.id),
      externalUserName: self.name,
      tokenEnc,
      tokenLast4,
      tokenExpiresAt,
      status: 'active' as const,
      lastValidatedAt: now,
      updatedAt: now,
    };
    const [row] = await db
      .insert(lmsConnections)
      .values(values)
      .onConflictDoUpdate({ target: lmsConnections.teacherId, set: values })
      .returning();
    if (!row) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to save Canvas connection');
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'canvas.connect',
      target: row.id,
      metadata: { baseUrl, canvasUserId: String(self.id) },
    });

    return success(c, connectionDto(row), 201);
  },
);

r.delete('/lms/canvas/connection', requireTeacherOrAdmin, requireScopeGroup('canvasSync'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const row = connectionOr404(await loadConnection(db, auth.user.id));

  // Best-effort remote revocation — only possible while the token still works,
  // and ONLY when the token is unambiguously ours (token_hint match). A
  // purpose match is not enough: deleting a look-alike token would break a
  // different live integration in the teacher's Canvas account.
  let remoteRevoked = false;
  if (row.tokenEnc) {
    try {
      const token = await decryptCanvasToken(c.env, row.tokenEnc);
      const client = new CanvasClient(row.baseUrl, token);
      const tokens = await client.listUserGeneratedTokens();
      const byHint = tokens.filter(
        (t) => !!t.token_hint && t.token_hint.endsWith(row.tokenLast4),
      );
      if (byHint.length === 1 && byHint[0]) {
        await client.deleteToken(byHint[0].id);
        remoteRevoked = true;
      }
    } catch {
      /* best-effort; the ciphertext is destroyed regardless */
    }
  }

  // Disconnect destroys the ciphertext but keeps the connection row: course
  // links, lms_id_map provenance, and roster snapshots survive so a later
  // reconnect + re-import stays idempotent (spec §3.2 — the UI promises
  // "content you already imported stays").
  await db
    .update(lmsConnections)
    .set({
      tokenEnc: '',
      tokenLast4: '',
      tokenExpiresAt: null,
      status: 'revoked',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lmsConnections.id, row.id));

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'canvas.disconnect',
    target: row.id,
    metadata: { baseUrl: row.baseUrl, remoteRevoked },
  });

  return success(c, { ok: true, remoteRevoked });
});

r.get('/lms/canvas/courses', requireTeacherOrAdmin, requireScopeGroup('canvasSync'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const connection = connectionOr404(await loadConnection(db, auth.user.id));
  const courses = await withCanvas(db, c.env, connection, (client) => client.listTeacherCourses());
  const now = new Date().toISOString();
  await db
    .update(lmsConnections)
    .set({ status: 'active', lastValidatedAt: now, updatedAt: now })
    .where(eq(lmsConnections.id, connection.id));
  return success(
    c,
    courses.filter((course) => course.workflow_state !== 'deleted').map(courseDto),
  );
});

// Import a Canvas course as a NEW CourseWise course (settings-page flow):
// create the course shell from Canvas metadata, link it, and start the
// initial_import workflow in one step. Remaining metadata (term, dates,
// syllabus) is filled by the workflow's empty-fields-only pass.
r.post(
  '/lms/canvas/import',
  requireTeacherOrAdmin,
  requireScopeGroup('canvasSync'),
  validateJson(importCanvasCourseSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const input = c.get('validated') as ImportCanvasCourseInput;
    const connection = connectionOr404(await loadConnection(db, auth.user.id));

    const [alreadyLinked] = await db
      .select({ courseId: lmsCourseLinks.courseId })
      .from(lmsCourseLinks)
      .where(
        and(
          eq(lmsCourseLinks.connectionId, connection.id),
          eq(lmsCourseLinks.externalCourseId, input.canvasCourseId),
        ),
      )
      .limit(1);
    if (alreadyLinked) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'This Canvas course is already imported — open its CourseWise course to re-import',
      );
    }

    const canvasCourse = await withCanvas(db, c.env, connection, (client) =>
      client.getCourse(input.canvasCourseId),
    );

    const code = canvasCourse.course_code?.trim() || `CANVAS-${input.canvasCourseId}`;
    const title = canvasCourse.name?.trim() || code;
    const [codeTaken] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.code, code))
      .limit(1);
    if (codeTaken) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        `Course code "${code}" already exists — open that course and link Canvas from its Canvas sync page instead`,
      );
    }

    const [created] = await db
      .insert(courses)
      .values({ code, title, gradingPolicyJson: DEFAULT_GRADING_POLICY })
      .returning({ id: courses.id });
    if (!created) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create course');
    }
    // Admins create the course without a teacher row (same as POST /courses
    // without teacherId); requireCourseTeacher passes admins regardless.
    if (auth.user.role === 'teacher') {
      await db.insert(courseTeachers).values({
        courseId: created.id,
        teacherId: auth.user.id,
        role: 'primary',
      });
    }

    const [link] = await db
      .insert(lmsCourseLinks)
      .values({
        connectionId: connection.id,
        courseId: created.id,
        externalCourseId: input.canvasCourseId,
        externalCourseName: canvasCourse.name ?? null,
        externalCourseCode: canvasCourse.course_code ?? null,
      })
      .returning({ id: lmsCourseLinks.id });
    if (!link) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to link Canvas course');
    }

    const [run] = await db
      .insert(lmsSyncRuns)
      .values({
        connectionId: connection.id,
        courseLinkId: link.id,
        kind: 'initial_import',
        requestedById: auth.user.id,
      })
      .returning({ id: lmsSyncRuns.id });
    if (!run) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create sync run');

    if (!c.env.LMS_SYNC_WORKFLOW) {
      await db
        .update(lmsSyncRuns)
        .set({
          status: 'failed',
          error: 'workflow-binding-missing',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(lmsSyncRuns.id, run.id));
      throw new ApiException(
        503,
        ERROR_CODES.INTERNAL_ERROR,
        'Canvas import is not enabled in this environment.',
      );
    }
    try {
      await c.env.LMS_SYNC_WORKFLOW.create({
        id: run.id,
        params: { runId: run.id, courseLinkId: link.id, kind: 'initial_import' as const },
      });
    } catch (err) {
      await db
        .update(lmsSyncRuns)
        .set({
          status: 'failed',
          error: `workflow-create-failed: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(lmsSyncRuns.id, run.id));
      throw new ApiException(
        503,
        ERROR_CODES.INTERNAL_ERROR,
        'Failed to start the import — try again shortly.',
      );
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.create',
      target: created.id,
      metadata: { code, source: 'canvas', canvasCourseId: input.canvasCourseId },
    });
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'canvas.import.run',
      target: run.id,
      metadata: { courseId: created.id, courseLinkId: link.id, createdCourse: true },
    });

    return success(
      c,
      { courseId: created.id, linkId: link.id, runId: run.id, status: 'pending' as const, code, title },
      202,
    );
  },
);

// --- Course-level: link + import runs ---

const courseGuards = [
  requireScopeGroup('canvasSync'),
  requireCourseTeacher(),
  requireTokenCourseAccess(),
] as const;

r.get('/courses/:courseId/canvas/link', ...courseGuards, async (c) => {
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  const [link] = await db
    .select()
    .from(lmsCourseLinks)
    .where(eq(lmsCourseLinks.courseId, courseId))
    .limit(1);
  if (!link) return success(c, null);
  const [conn] = await db
    .select({ status: lmsConnections.status, baseUrl: lmsConnections.baseUrl })
    .from(lmsConnections)
    .where(eq(lmsConnections.id, link.connectionId))
    .limit(1);
  return success(c, {
    id: link.id,
    externalCourseId: link.externalCourseId,
    externalCourseName: link.externalCourseName,
    externalCourseCode: link.externalCourseCode,
    importedAt: link.importedAt,
    lastRosterFetchAt: link.lastRosterFetchAt,
    connectionStatus: conn?.status ?? null,
    canvasBaseUrl: conn?.baseUrl ?? null,
  });
});

r.post(
  '/courses/:courseId/canvas/link',
  ...courseGuards,
  validateJson(linkCanvasCourseSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const input = c.get('validated') as LinkCanvasCourseInput;
    const connection = connectionOr404(await loadConnection(db, auth.user.id));

    const [existing] = await db
      .select({ id: lmsCourseLinks.id, externalCourseId: lmsCourseLinks.externalCourseId })
      .from(lmsCourseLinks)
      .where(eq(lmsCourseLinks.courseId, courseId))
      .limit(1);
    if (existing && existing.externalCourseId !== input.canvasCourseId) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        'This course is already linked to a different Canvas course',
      );
    }

    // Verify the Canvas course is reachable with this token and capture its
    // name/code for display.
    const canvasCourse = await withCanvas(db, c.env, connection, (client) =>
      client.getCourse(input.canvasCourseId),
    );

    const now = new Date().toISOString();
    let linkId: string;
    if (existing) {
      linkId = existing.id;
      await db
        .update(lmsCourseLinks)
        .set({
          externalCourseName: canvasCourse.name ?? null,
          externalCourseCode: canvasCourse.course_code ?? null,
          updatedAt: now,
        })
        .where(eq(lmsCourseLinks.id, existing.id));
    } else {
      const [inserted] = await db
        .insert(lmsCourseLinks)
        .values({
          connectionId: connection.id,
          courseId,
          externalCourseId: input.canvasCourseId,
          externalCourseName: canvasCourse.name ?? null,
          externalCourseCode: canvasCourse.course_code ?? null,
        })
        .returning({ id: lmsCourseLinks.id });
      if (!inserted) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to link Canvas course');
      }
      linkId = inserted.id;
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'canvas.course.link',
      target: linkId,
      metadata: { courseId, canvasCourseId: input.canvasCourseId },
    });

    return success(c, { linkId }, existing ? 200 : 201);
  },
);

r.post('/courses/:courseId/canvas/import', ...courseGuards, async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');

  const [link] = await db
    .select({ id: lmsCourseLinks.id, connectionId: lmsCourseLinks.connectionId })
    .from(lmsCourseLinks)
    .where(eq(lmsCourseLinks.courseId, courseId))
    .limit(1);
  if (!link) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Link a Canvas course first');
  }

  // A run stuck in pending/running (e.g. Worker killed mid-workflow) must not
  // block imports forever — an initial import finishes in minutes, so anything
  // older than the staleness window no longer counts as in-progress.
  const IN_PROGRESS_STALE_MS = 30 * 60 * 1000;
  const [latest] = await db
    .select({ status: lmsSyncRuns.status, createdAt: lmsSyncRuns.createdAt })
    .from(lmsSyncRuns)
    .where(eq(lmsSyncRuns.courseLinkId, link.id))
    .orderBy(desc(lmsSyncRuns.createdAt))
    .limit(1);
  if (
    latest &&
    (latest.status === 'pending' || latest.status === 'running') &&
    Date.now() - new Date(latest.createdAt).getTime() < IN_PROGRESS_STALE_MS
  ) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'An import is already in progress');
  }

  const [run] = await db
    .insert(lmsSyncRuns)
    .values({
      connectionId: link.connectionId,
      courseLinkId: link.id,
      kind: 'initial_import',
      requestedById: auth.user.id,
    })
    .returning({ id: lmsSyncRuns.id });
  if (!run) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create sync run');

  if (!c.env.LMS_SYNC_WORKFLOW) {
    await db
      .update(lmsSyncRuns)
      .set({
        status: 'failed',
        error: 'workflow-binding-missing',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(lmsSyncRuns.id, run.id));
    throw new ApiException(
      503,
      ERROR_CODES.INTERNAL_ERROR,
      'Canvas import is not enabled in this environment.',
    );
  }

  try {
    await c.env.LMS_SYNC_WORKFLOW.create({
      id: run.id,
      params: { runId: run.id, courseLinkId: link.id, kind: 'initial_import' as const },
    });
  } catch (err) {
    // Without this the row would sit 'pending' forever and the in-progress
    // guard above would 409 every retry until the staleness window passes.
    await db
      .update(lmsSyncRuns)
      .set({
        status: 'failed',
        error: `workflow-create-failed: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(lmsSyncRuns.id, run.id));
    throw new ApiException(
      503,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to start the import — try again shortly.',
    );
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'canvas.import.run',
    target: run.id,
    metadata: { courseId, courseLinkId: link.id },
  });

  return success(c, { runId: run.id, status: 'pending' as const }, 202);
});

r.get('/courses/:courseId/canvas/runs', ...courseGuards, async (c) => {
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  const [link] = await db
    .select({ id: lmsCourseLinks.id })
    .from(lmsCourseLinks)
    .where(eq(lmsCourseLinks.courseId, courseId))
    .limit(1);
  if (!link) return success(c, []);
  const rows = await db
    .select({
      id: lmsSyncRuns.id,
      kind: lmsSyncRuns.kind,
      status: lmsSyncRuns.status,
      summaryJson: lmsSyncRuns.summaryJson,
      error: lmsSyncRuns.error,
      createdAt: lmsSyncRuns.createdAt,
      completedAt: lmsSyncRuns.completedAt,
    })
    .from(lmsSyncRuns)
    .where(eq(lmsSyncRuns.courseLinkId, link.id))
    .orderBy(desc(lmsSyncRuns.createdAt))
    .limit(20);
  return success(c, rows);
});

export default r;
