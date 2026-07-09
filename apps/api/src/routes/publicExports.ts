import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { exportShareDownloadSchema, type ExportShareDownloadInput } from '@coursewise/shared';
import { courses } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { presignR2Url, r2SignerConfigFromEnv } from '../lib/r2Sign';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import {
  checkPassphrase,
  reserveDownloadSlot,
  resolveShareByToken,
  type ShareValidationError,
} from '../services/courseExportShare';
import type { AppEnv } from '../types';

// Public (unauthenticated) guest download of a course export via a capability
// share link. NO requireAuth — the token IS the credential. Both routes are
// listed in PUBLIC_ROUTE_WHITELIST so auth-coverage allows them. Responses
// never carry student PII beyond the course code + file name.
const r = new Hono<AppEnv>();

const DOWNLOAD_PRESIGN_EXPIRES = 5 * 60; // 5 minutes, same as the authed path.

// Map a share validation error to an HTTP status. 'not_found'/'revoked'/
// 'expired'/'exhausted'/'locked'/'job_unavailable' all read as "link no longer
// works" — deliberately coarse so guests can't probe internal state.
function shareErrorToHttp(error: ShareValidationError): ApiException {
  switch (error) {
    case 'expired':
      return new ApiException(410, ERROR_CODES.NOT_FOUND, 'This link has expired');
    case 'exhausted':
      return new ApiException(410, ERROR_CODES.NOT_FOUND, 'This link has reached its download limit');
    case 'revoked':
      return new ApiException(410, ERROR_CODES.NOT_FOUND, 'This link has been revoked');
    case 'locked':
      return new ApiException(423, ERROR_CODES.FORBIDDEN, 'This link is locked after too many attempts');
    case 'passphrase_required':
      return new ApiException(401, ERROR_CODES.UNAUTHORIZED, 'A passphrase is required');
    case 'passphrase_invalid':
      return new ApiException(403, ERROR_CODES.FORBIDDEN, 'Incorrect passphrase');
    case 'job_unavailable':
    case 'not_found':
    default:
      return new ApiException(404, ERROR_CODES.NOT_FOUND, 'This link is no longer available');
  }
}

function fileNameFor(code: string | null): string {
  return `${(code ?? 'course').replace(/[^A-Za-z0-9._-]/g, '_')}-export.zip`;
}

// Guest-visible metadata for the share page. No PII beyond course code.
r.get('/exports/:token', async (c) => {
  const db = c.get('db');
  const token = requireParam(c, 'token');
  const resolved = await resolveShareByToken(db, token);
  if (!resolved.ok) throw shareErrorToHttp(resolved.error);
  const { share, job } = resolved;

  const [course] = await db
    .select({ code: courses.code })
    .from(courses)
    .where(eq(courses.id, share.courseId))
    .limit(1);

  return success(c, {
    courseCode: course?.code ?? null,
    fileName: fileNameFor(course?.code ?? null),
    sizeBytes: job.sizeBytes,
    expiresAt: share.expiresAt,
    requiresPassphrase: !!share.passphraseHash,
    downloadsRemaining: Math.max(0, share.maxDownloads - share.downloadCount),
  });
});

// Validate token (+ passphrase + limits) and mint a short-lived presigned URL.
r.post(
  '/exports/:token/download',
  validateJson(exportShareDownloadSchema),
  async (c) => {
    const db = c.get('db');
    const token = requireParam(c, 'token');
    const input = c.get('validated') as ExportShareDownloadInput;

    const resolved = await resolveShareByToken(db, token);
    if (!resolved.ok) throw shareErrorToHttp(resolved.error);
    const { share, job } = resolved;

    const pass = await checkPassphrase(db, share, input.passphrase);
    if (!pass.ok) throw shareErrorToHttp(pass.error);

    // R2 misconfiguration must not enumerate binding names to anonymous
    // callers — log the detail server-side, return a generic 500.
    const config = r2SignerConfigFromEnv(c.env);
    if (!config.config) {
      console.error('publicExports: R2 presign not configured', { missing: config.missing });
      throw new ApiException(
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'Download is temporarily unavailable.',
      );
    }

    // Claim a download slot atomically (cap + validity) BEFORE minting the URL,
    // so concurrent guests can't exceed maxDownloads and the disclosure count
    // stays accurate. A lost race here reads as "exhausted".
    const reserved = await reserveDownloadSlot(db, share.id);
    if (!reserved.ok) throw shareErrorToHttp('exhausted');

    const [course] = await db
      .select({ code: courses.code })
      .from(courses)
      .where(eq(courses.id, share.courseId))
      .limit(1);
    const fileName = fileNameFor(course?.code ?? null);

    let presigned;
    try {
      presigned = await presignR2Url(config.config, {
        method: 'GET',
        key: job.objectKey as string,
        expiresInSeconds: DOWNLOAD_PRESIGN_EXPIRES,
        extraQuery: { 'response-content-disposition': `attachment; filename="${fileName}"` },
      });
    } catch (err) {
      console.error('publicExports: presign failed', { shareId: share.id, err });
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Download is temporarily unavailable.');
    }

    // Guest download is a FERPA §99.32 disclosure by the teacher who created
    // the share. Record it (system actor, no CourseWise user).
    await recordAudit(db, {
      actorType: 'system',
      action: 'course.export.share.download',
      target: share.id,
      ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
      metadata: {
        courseId: share.courseId,
        exportJobId: share.exportJobId,
        sharedById: share.createdById,
        downloadsRemaining: Math.max(0, share.maxDownloads - reserved.downloadCount),
      },
    });

    return success(c, { downloadUrl: presigned.url, expiresAt: presigned.expiresAt, fileName });
  },
);

export default r;
