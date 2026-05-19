import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  completeUploadSchema,
  uploadUrlRequestSchema,
  type CompleteUploadInput,
  type DownloadUrlResponse,
  type UploadUrlRequest,
  type UploadUrlResponse,
} from '@coursewise/shared';
import {
  assignmentSubmissions,
  assignments,
  fileAssets,
  readingMaterials,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { buildR2Key, presignR2Url, type R2SignerConfig } from '../lib/r2Sign';
import { requireAuth } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const PRESIGN_EXPIRES = 5 * 60; // 5 minutes

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
      `R2 storage is not configured on this Worker: missing secret${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. Run apps/api/scripts/setup-r2.sh to provision.`,
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

r.post('/files/upload-url', validateJson(uploadUrlRequestSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const input = c.get('validated') as UploadUrlRequest;

  // Permission: teachers/admins can upload material + assignment attachments;
  // enrolled students can upload SUBMISSION attachments.
  if (input.relatedType === 'submission') {
    if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, input.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
    } else if (!(await canWriteCourse(db, auth.user, input.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
  } else {
    if (!(await canWriteCourse(db, auth.user, input.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
  }

  const r2Key = buildR2Key(input.courseId, input.fileName);
  const cfg = signerConfig(c.env);

  // Insert the placeholder file_asset row.
  const [inserted] = await db
    .insert(fileAssets)
    .values({
      ownerId: auth.user.id,
      courseId: input.courseId,
      bucket: cfg.bucket,
      objectKey: r2Key,
      contentType: input.mimeType,
      sizeBytes: input.fileSize,
      originalFilename: input.fileName,
      status: 'pending',
      relatedType: input.relatedType,
    })
    .returning();
  if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to register asset');

  const presigned = await presignR2Url(cfg, {
    method: 'PUT',
    key: r2Key,
    expiresInSeconds: PRESIGN_EXPIRES,
    signedHeaders: { 'content-type': input.mimeType },
  });

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'file.upload-url',
    target: inserted.id,
    metadata: { courseId: input.courseId, mimeType: input.mimeType, sizeBytes: input.fileSize },
  });

  const body: UploadUrlResponse = {
    uploadUrl: presigned.url,
    fileAssetId: inserted.id,
    r2Key,
    expiresAt: presigned.expiresAt,
    headers: { 'content-type': input.mimeType },
  };
  return success(c, body, 201);
});

r.post('/files/complete-upload', validateJson(completeUploadSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const input = c.get('validated') as CompleteUploadInput;
  const [row] = await db.select().from(fileAssets).where(eq(fileAssets.id, input.fileAssetId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'File asset not found');
  // Only the original uploader (or course staff) can complete the upload.
  const isOwner = row.ownerId === auth.user.id;
  const isCourseStaff = !!row.courseId && (await canWriteCourse(db, auth.user, row.courseId));
  if (!isOwner && !isCourseStaff) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this file');
  }

  // Confirm the object exists in R2 (HEAD via Worker binding when available;
  // otherwise trust the presigned PUT succeeded and just flip the flag).
  let etag: string | null = null;
  let confirmedSize: number | null = null;
  let confirmedType: string | null = null;
  if (c.env.COURSE_FILES) {
    const head = await c.env.COURSE_FILES.head(row.objectKey);
    if (!head) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Object not present in R2 — upload first');
    }
    etag = head.etag ?? null;
    confirmedSize = head.size ?? null;
    confirmedType = head.httpMetadata?.contentType ?? null;
    if (confirmedSize !== null && row.sizeBytes !== null && confirmedSize !== row.sizeBytes) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Uploaded size does not match the declared size');
    }
    if (confirmedType && row.contentType && confirmedType !== row.contentType) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Uploaded content-type does not match the declared mime type');
    }
  }

  const [updated] = await db
    .update(fileAssets)
    .set({
      status: 'ready',
      etag,
      sizeBytes: confirmedSize ?? row.sizeBytes,
      contentType: confirmedType ?? row.contentType,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fileAssets.id, input.fileAssetId))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'File asset not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'file.complete-upload',
    target: input.fileAssetId,
  });

  return success(c, {
    id: updated.id,
    status: updated.status,
    sizeBytes: updated.sizeBytes,
    contentType: updated.contentType,
  });
});

r.get('/files/:fileId/download-url', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const fileId = requireParam(c, 'fileId');
  const [row] = await db.select().from(fileAssets).where(eq(fileAssets.id, fileId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'File not found');
  if (row.status !== 'ready') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'File is not ready for download');
  }

  // Visibility:
  //   admin → ok
  //   teacher → must teach the course
  //   student → must be enrolled AND attached resource must be visible to them
  if (auth.user.role !== 'admin') {
    if (!row.courseId) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'File is not tied to a course');
    }
    if (auth.user.role === 'teacher') {
      if (!(await isCourseTeacher(db, row.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
      }
    } else {
      // student
      if (!(await isCourseEnrolled(db, row.courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
      if (row.relatedType === 'material' && row.relatedId) {
        const mat = (
          await db.select().from(readingMaterials).where(eq(readingMaterials.id, row.relatedId)).limit(1)
        )[0];
        if (!mat || mat.status !== 'published') {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Material is not published');
        }
      } else if (row.relatedType === 'assignment' && row.relatedId) {
        const a = (
          await db.select().from(assignments).where(eq(assignments.id, row.relatedId)).limit(1)
        )[0];
        if (!a || a.status === 'draft') {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Assignment is not published');
        }
      } else if (row.relatedType === 'submission' && row.relatedId) {
        const sub = (
          await db
            .select()
            .from(assignmentSubmissions)
            .where(eq(assignmentSubmissions.id, row.relatedId))
            .limit(1)
        )[0];
        if (!sub || sub.studentId !== auth.user.id) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot download another student submission');
        }
      } else {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No published resource references this file');
      }
    }
  }

  const cfg = signerConfig(c.env);
  const presigned = await presignR2Url(cfg, {
    method: 'GET',
    key: row.objectKey,
    expiresInSeconds: PRESIGN_EXPIRES,
    extraQuery: row.originalFilename
      ? { 'response-content-disposition': `attachment; filename="${row.originalFilename.replace(/"/g, '')}"` }
      : undefined,
  });

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'file.download-url',
    target: fileId,
  });

  const body: DownloadUrlResponse = {
    downloadUrl: presigned.url,
    expiresAt: presigned.expiresAt,
    fileName: row.originalFilename ?? null,
    contentType: row.contentType ?? null,
    sizeBytes: row.sizeBytes ?? null,
  };
  return success(c, body);
});

r.delete('/files/:fileId', requireScopeGroup('materialsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const fileId = requireParam(c, 'fileId');
  const [row] = await db.select().from(fileAssets).where(eq(fileAssets.id, fileId)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'File not found');
  if (!row.courseId || !(await canWriteCourse(db, auth.user, row.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this file');
  }
  // Best-effort delete from R2 via binding
  if (c.env.COURSE_FILES) {
    try {
      await c.env.COURSE_FILES.delete(row.objectKey);
    } catch (err) {
      console.error('failed to delete R2 object', { key: row.objectKey, err });
    }
  }
  await db
    .update(fileAssets)
    .set({ status: 'deleted', updatedAt: new Date().toISOString() })
    .where(eq(fileAssets.id, fileId));
  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'file.delete',
    target: fileId,
  });
  return success(c, { id: fileId });
});

export default r;
