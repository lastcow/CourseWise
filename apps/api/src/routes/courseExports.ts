import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import {
  createExportShareSchema,
  type CreateExportShareInput,
  type ExportShare,
} from '@coursewise/shared';
import { courseExportJobs, courseExportShares, courses } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { presignR2Url, r2SignerConfigFromEnv, type R2SignerConfig } from '../lib/r2Sign';
import { resolveRequestOrigin } from '../lib/requestOrigin';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse } from '../services/courseAccess';
import {
  createExportShare,
  listActiveShares,
  revokeShare,
} from '../services/courseExportShare';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const DOWNLOAD_PRESIGN_EXPIRES = 5 * 60; // 5 minutes

function signerConfig(env: AppBindings): R2SignerConfig {
  const result = r2SignerConfigFromEnv(env);
  if (!result.config) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      `R2 download presign is not configured: missing ${result.missing.join(', ')}.`,
    );
  }
  return result.config;
}

function shareDto(row: typeof courseExportShares.$inferSelect, url: string | null): ExportShare {
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    maxDownloads: row.maxDownloads,
    downloadCount: row.downloadCount,
    hasPassphrase: !!row.passphraseHash,
    locked: !!row.lockedAt,
    lastDownloadedAt: row.lastDownloadedAt ?? null,
    url,
  };
}

// Request an async course export. Builds the ZIP in a Cloudflare Workflow and
// emails the requester a download link when it's ready.
r.post(
  '/courses/:courseId/exports',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    const [job] = await db
      .insert(courseExportJobs)
      .values({ courseId, requestedById: auth.user.id, status: 'pending' })
      .returning({ id: courseExportJobs.id });
    if (!job) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create export job');

    if (!c.env.COURSE_EXPORT_WORKFLOW) {
      await db
        .update(courseExportJobs)
        .set({
          status: 'failed',
          error: 'workflow-binding-missing',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(courseExportJobs.id, job.id));
      throw new ApiException(
        503,
        ERROR_CODES.INTERNAL_ERROR,
        'Course export is not enabled in this environment.',
      );
    }

    const appBaseUrl = resolveRequestOrigin(c);
    await c.env.COURSE_EXPORT_WORKFLOW.create({
      id: job.id,
      params: { jobId: job.id, courseId, appBaseUrl },
    });

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.export.request',
      target: job.id,
      metadata: { courseId },
    });

    return success(c, { jobId: job.id, status: 'pending' as const }, 202);
  },
);

// List recent export jobs for the course (for the Exports UI / polling).
r.get(
  '/courses/:courseId/exports',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canAccessCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
    const rows = await db
      .select({
        id: courseExportJobs.id,
        status: courseExportJobs.status,
        sizeBytes: courseExportJobs.sizeBytes,
        error: courseExportJobs.error,
        createdAt: courseExportJobs.createdAt,
        completedAt: courseExportJobs.completedAt,
        expiresAt: courseExportJobs.expiresAt,
      })
      .from(courseExportJobs)
      .where(eq(courseExportJobs.courseId, courseId))
      .orderBy(desc(courseExportJobs.createdAt))
      .limit(20);
    return success(c, rows);
  },
);

// Issue a short-lived presigned R2 GET for a completed export. Re-checks the
// caller is a teacher of the course, so the email link alone is not a credential.
r.get(
  '/courses/:courseId/exports/:jobId/download-url',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const jobId = requireParam(c, 'jobId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this export');
    }
    const [job] = await db
      .select()
      .from(courseExportJobs)
      .where(and(eq(courseExportJobs.id, jobId), eq(courseExportJobs.courseId, courseId)))
      .limit(1);
    if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Export not found');
    if (job.status !== 'done' || !job.objectKey) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Export is not ready');
    }
    if (job.expiresAt && Date.parse(job.expiresAt) < Date.now()) {
      throw new ApiException(410, ERROR_CODES.NOT_FOUND, 'Export has expired');
    }

    const [course] = await db
      .select({ code: courses.code })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    const fileName = `${(course?.code ?? 'course').replace(/[^A-Za-z0-9._-]/g, '_')}-export.zip`;
    const presigned = await presignR2Url(signerConfig(c.env), {
      method: 'GET',
      key: job.objectKey,
      expiresInSeconds: DOWNLOAD_PRESIGN_EXPIRES,
      extraQuery: { 'response-content-disposition': `attachment; filename="${fileName}"` },
    });

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.export.download',
      target: jobId,
      metadata: { courseId },
    });

    return success(c, { downloadUrl: presigned.url, expiresAt: presigned.expiresAt, fileName });
  },
);

// Helper: load a completed, unexpired export owned by the course, or throw.
async function requireDownloadableExport(
  db: AppEnv['Variables']['db'],
  courseId: string,
  jobId: string,
): Promise<typeof courseExportJobs.$inferSelect> {
  const [job] = await db
    .select()
    .from(courseExportJobs)
    .where(and(eq(courseExportJobs.id, jobId), eq(courseExportJobs.courseId, courseId)))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Export not found');
  if (job.status !== 'done' || !job.objectKey) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Export is not ready');
  }
  if (job.expiresAt && Date.parse(job.expiresAt) < Date.now()) {
    throw new ApiException(410, ERROR_CODES.NOT_FOUND, 'Export has expired');
  }
  return job;
}

// Create a guest share link for a completed export. Returns the plaintext link
// ONCE. A teacher of the course only.
r.post(
  '/courses/:courseId/exports/:jobId/shares',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createExportShareSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const jobId = requireParam(c, 'jobId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this export');
    }
    const job = await requireDownloadableExport(db, courseId, jobId);
    const input = c.get('validated') as CreateExportShareInput;

    const { row, token } = await createExportShare(db, {
      exportJobId: jobId,
      courseId,
      createdById: auth.user.id,
      passphrase: input.passphrase ?? null,
      expiresInHours: input.expiresInHours ?? null,
      maxDownloads: input.maxDownloads ?? null,
      jobExpiresAt: job.expiresAt ?? null,
    });

    const origin = resolveRequestOrigin(c).replace(/\/$/, '');
    const url = `${origin}/share/export/${token}`;

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.export.share.create',
      target: row.id,
      metadata: {
        courseId,
        jobId,
        hasPassphrase: !!row.passphraseHash,
        expiresAt: row.expiresAt,
        maxDownloads: row.maxDownloads,
      },
    });

    return success(c, shareDto(row, url), 201);
  },
);

// List active (non-revoked) shares for an export. Never returns token/hash.
r.get(
  '/courses/:courseId/exports/:jobId/shares',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const jobId = requireParam(c, 'jobId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this export');
    }
    const rows = await listActiveShares(db, jobId);
    return success(
      c,
      rows.filter((row) => row.courseId === courseId).map((row) => shareDto(row, null)),
    );
  },
);

// Revoke a share (kills the guest link immediately).
r.delete(
  '/courses/:courseId/exports/:jobId/shares/:shareId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const shareId = requireParam(c, 'shareId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this export');
    }
    const revoked = await revokeShare(db, { shareId, courseId });
    if (!revoked) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Share not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.export.share.revoke',
      target: shareId,
      metadata: { courseId },
    });

    return success(c, { ok: true });
  },
);

export default r;
