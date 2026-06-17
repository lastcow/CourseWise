import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  FILE_RELATED_TYPES,
  MAX_UPLOAD_BYTES,
  type DownloadUrlResponse,
  type UploadFileResponse,
} from '@coursewise/shared';
import {
  announcementTargets,
  announcements,
  assignmentSubmissions,
  assignments,
  fileAssets,
  groupMemberships,
  presentations,
  readingMaterials,
  messageThreads,
  messages,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { buildR2Key, presignR2Url, type R2SignerConfig } from '../lib/r2Sign';
import { requireAuth } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { canWriteCourse, isCourseEnrolled, isCourseTeacher } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const PRESIGN_EXPIRES = 5 * 60; // 5 minutes

// SigV4 signer config — used only for the download presign path. Uploads use
// the COURSE_FILES R2 binding directly, which authenticates via the Worker's
// native binding and does not need any S3 credentials.
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
      `R2 download presign is not configured on this Worker: missing secret${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. Run apps/api/scripts/setup-r2.sh to provision.`,
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

const uploadFormSchema = z.object({
  courseId: z.string().uuid(),
  relatedType: z.enum(FILE_RELATED_TYPES).default('material'),
});

r.post('/files/upload', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');

  if (!c.env.COURSE_FILES) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'R2 bucket binding (COURSE_FILES) is not configured on this Worker',
    );
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new ApiException(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Expected multipart/form-data body with a "file" part',
    );
  }

  // workers-types declares FormData.get() as `string | null`, but the runtime
  // actually returns a File for binary parts. Cast through unknown so the
  // instanceof check below can narrow properly.
  const fileField = form.get('file') as unknown;
  if (!(fileField instanceof File)) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, '"file" multipart field is missing');
  }

  const parsed = uploadFormSchema.safeParse({
    courseId: form.get('courseId'),
    relatedType: form.get('relatedType') ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiException(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const { courseId, relatedType } = parsed.data;

  const fileName = fileField.name;
  const fileType = fileField.type;
  const fileSize = fileField.size;

  if (!fileName || fileName.length > 255 || /[/\\?<>:"|*]/.test(fileName)) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid file name');
  }
  // MIME allowlist with an extension fallback: browsers report source-code
  // files (.java, .py, …) inconsistently — often application/octet-stream or
  // an empty string — so a known extension also passes.
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const mimeAllowed = (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(fileType);
  const extAllowed = (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension);
  if (!mimeAllowed && !extAllowed) {
    throw new ApiException(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `mimeType "${fileType || '<missing>'}" is not in the upload allowlist`,
    );
  }
  if (fileSize === 0) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'File is empty');
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new ApiException(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `File exceeds max upload size of ${MAX_UPLOAD_BYTES} bytes`,
    );
  }

  if (relatedType === 'submission' || relatedType === 'message') {
    // Students may upload for their own submissions and messages; staff for
    // any course they can write.
    if (auth.user.role === 'student') {
      if (!(await isCourseEnrolled(db, courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
      }
    } else if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
  } else {
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
  }

  const r2Key = buildR2Key(courseId, fileName);
  const bucket = c.env.R2_BUCKET ?? 'coursewise-files';

  const put = await c.env.COURSE_FILES.put(r2Key, fileField.stream() as ReadableStream, {
    httpMetadata: { contentType: fileType },
  });
  const etag = put?.etag ?? null;
  const uploadedSize = put?.size ?? fileSize;

  let row: typeof fileAssets.$inferSelect | undefined;
  try {
    [row] = await db
      .insert(fileAssets)
      .values({
        ownerId: auth.user.id,
        courseId,
        bucket,
        objectKey: r2Key,
        contentType: fileType,
        sizeBytes: uploadedSize,
        originalFilename: fileName,
        etag,
        status: 'ready',
        relatedType,
      })
      .returning();
  } catch (err) {
    // Don't orphan the just-uploaded R2 object on a DB failure.
    try {
      await c.env.COURSE_FILES.delete(r2Key);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
  if (!row) {
    try {
      await c.env.COURSE_FILES.delete(r2Key);
    } catch {
      // best-effort cleanup
    }
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to register file asset');
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'file.upload',
    target: row.id,
    metadata: { courseId, mimeType: fileType, sizeBytes: uploadedSize },
  });

  const body: UploadFileResponse = {
    fileAssetId: row.id,
    r2Key,
    sizeBytes: uploadedSize,
    contentType: fileType,
    originalFilename: fileName,
    status: 'ready',
  };
  return success(c, body, 201);
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
        if (!sub) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot download another student submission');
        }
        let allowed = sub.studentId === auth.user.id;
        // Group submissions are shared: any member linked to the same
        // group_submissions row may download a teammate's attached file.
        if (!allowed && sub.groupSubmissionId) {
          const mine = (
            await db
              .select({ id: assignmentSubmissions.id })
              .from(assignmentSubmissions)
              .where(
                and(
                  eq(assignmentSubmissions.groupSubmissionId, sub.groupSubmissionId),
                  eq(assignmentSubmissions.studentId, auth.user.id),
                ),
              )
              .limit(1)
          )[0];
          allowed = !!mine;
        }
        if (!allowed) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot download another student submission');
        }
      } else if (row.relatedType === 'message' && row.relatedId) {
        // Message attachments are private to the two thread participants.
        const [msg] = await db
          .select({ threadId: messages.threadId })
          .from(messages)
          .where(eq(messages.id, row.relatedId))
          .limit(1);
        const thread = msg
          ? (
              await db
                .select({ a: messageThreads.participantAId, b: messageThreads.participantBId })
                .from(messageThreads)
                .where(eq(messageThreads.id, msg.threadId))
                .limit(1)
            )[0]
          : undefined;
        if (!thread || (thread.a !== auth.user.id && thread.b !== auth.user.id)) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a participant in this conversation');
        }
      } else if (row.relatedType === 'announcement' && row.relatedId) {
        // Announcement attachments: visible once the announcement is published
        // and, when targeted, the student is a member of a target group.
        const ann = (
          await db.select().from(announcements).where(eq(announcements.id, row.relatedId)).limit(1)
        )[0];
        if (!ann || ann.status !== 'published') {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Announcement is not published');
        }
        if (ann.audience === 'groups') {
          const [hit] = await db
            .select({ id: announcementTargets.id })
            .from(announcementTargets)
            .innerJoin(groupMemberships, eq(groupMemberships.groupId, announcementTargets.groupId))
            .where(
              and(
                eq(announcementTargets.announcementId, ann.id),
                eq(groupMemberships.studentId, auth.user.id),
              ),
            )
            .limit(1);
          if (!hit) {
            throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Announcement is not addressed to you');
          }
        }
      } else {
        // Presentation files are linked via `presentations.fileAssetId` rather
        // than `fileAssets.relatedType`/`relatedId`, so a student request hits
        // this fallback. Allow when a published presentation in the same
        // course references this asset.
        const pres = (
          await db
            .select({ status: presentations.status, courseId: presentations.courseId })
            .from(presentations)
            .where(eq(presentations.fileAssetId, fileId))
            .limit(1)
        )[0];
        if (!pres || pres.status !== 'published' || pres.courseId !== row.courseId) {
          throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No published resource references this file');
        }
      }
    }
  }

  const cfg = signerConfig(c.env);
  // Message attachments open inline so the browser previews them (and falls
  // back to downloading whatever it can't render); every other file type
  // forces a download so it saves straight to disk.
  const disposition = row.relatedType === 'message' ? 'inline' : 'attachment';
  const presigned = await presignR2Url(cfg, {
    method: 'GET',
    key: row.objectKey,
    expiresInSeconds: PRESIGN_EXPIRES,
    extraQuery: row.originalFilename
      ? {
          'response-content-disposition': `${disposition}; filename="${row.originalFilename.replace(/"/g, '')}"`,
        }
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
