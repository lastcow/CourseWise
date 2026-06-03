import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { courseExportJobs, courses } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { presignR2Url, type R2SignerConfig } from '../lib/r2Sign';
import { resolveRequestOrigin } from '../lib/requestOrigin';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse } from '../services/courseAccess';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const DOWNLOAD_PRESIGN_EXPIRES = 5 * 60; // 5 minutes

function signerConfig(env: AppBindings): R2SignerConfig {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET ?? 'coursewise-files';
  const missing: string[] = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length > 0) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      `R2 download presign is not configured: missing ${missing.join(', ')}.`,
    );
  }
  return {
    accountId: accountId as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket,
    endpoint: env.R2_PUBLIC_ENDPOINT || undefined,
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

export default r;
