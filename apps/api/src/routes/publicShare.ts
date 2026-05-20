import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { PublicPresentationView } from '@coursewise/shared';
import { courses, fileAssets, presentations } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { presignR2Url, type R2SignerConfig } from '../lib/r2Sign';
import type { AppBindings, AppEnv } from '../types';

/**
 * Unauthenticated routes that serve a public viewer for presentations that
 * teachers have explicitly toggled to "shared". A 404 (rather than 403) is
 * returned for anything not shared so a token harvester can't distinguish
 * "token doesn't exist" from "token exists but is disabled".
 */
const r = new Hono<AppEnv>();

const SHARE_PRESIGN_EXPIRES = 5 * 60;

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
      `R2 download presign is not configured: missing ${missing.join(', ')}`,
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

// GET /api/share/presentations/:token — viewer metadata.
r.get('/share/presentations/:token', async (c) => {
  const token = requireParam(c, 'token');
  const db = c.get('db');
  const [row] = await db
    .select({ pres: presentations, courseTitle: courses.title })
    .from(presentations)
    .innerJoin(courses, eq(courses.id, presentations.courseId))
    .where(eq(presentations.shareToken, token))
    .limit(1);
  if (!row || !row.pres.shareEnabled) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Share link not found');
  }
  // Only Gamma decks are mirrored as .pptx today; non-Gamma shares get the
  // download-disabled experience.
  const hasDownload = row.pres.provider === 'gamma' && row.pres.fileAssetId != null;
  const body: PublicPresentationView = {
    title: row.pres.title,
    description: row.pres.description ?? null,
    courseTitle: row.courseTitle,
    externalUrl: row.pres.externalUrl ?? null,
    hasDownload,
  };
  return success(c, body);
});

// GET /api/share/presentations/:token/download.pptx — public-viewer-driven
// download. Resolves the linked file asset and 302s to a short-lived presigned
// R2 URL. We don't stream the body through the Worker (5-min presign is plenty
// and saves egress + CPU time).
r.get('/share/presentations/:token/download.pptx', async (c) => {
  const token = requireParam(c, 'token');
  const db = c.get('db');
  const [row] = await db
    .select({ pres: presentations })
    .from(presentations)
    .where(eq(presentations.shareToken, token))
    .limit(1);
  if (!row || !row.pres.shareEnabled || !row.pres.fileAssetId) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Download not available');
  }
  const [asset] = await db
    .select()
    .from(fileAssets)
    .where(eq(fileAssets.id, row.pres.fileAssetId))
    .limit(1);
  if (!asset || asset.status !== 'ready') {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Download not available');
  }
  const cfg = signerConfig(c.env);
  const filename = `${row.pres.title.replace(/[^A-Za-z0-9._-]+/g, '_')}.pptx`;
  const presigned = await presignR2Url(cfg, {
    method: 'GET',
    key: asset.objectKey,
    expiresInSeconds: SHARE_PRESIGN_EXPIRES,
    extraQuery: {
      'response-content-disposition': `attachment; filename="${filename}"`,
    },
  });
  return c.redirect(presigned.url, 302);
});

export default r;
