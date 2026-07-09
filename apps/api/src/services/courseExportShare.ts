import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { courseExportJobs, courseExportShares, type CourseExportShareRow } from '../db/schema';
import { randomBase62, sha256Hex } from '../lib/crypto';
import { hashPassword, verifyPassword } from './password';

export const SHARE_TOKEN_LENGTH = 48;
export const SHARE_DEFAULT_TTL_HOURS = 24;
export const SHARE_DEFAULT_MAX_DOWNLOADS = 10;
// Absolute ceiling; a share must never outlive the export file, whose TTL is
// COURSE_EXPORT_TTL_HOURS (72). Callers clamp to the export's own expiry too.
export const SHARE_MAX_TTL_HOURS = 72;
export const SHARE_MAX_FAILED_ATTEMPTS = 10;

export interface CreateShareInput {
  exportJobId: string;
  courseId: string;
  createdById: string | null;
  passphrase?: string | null;
  expiresInHours?: number | null;
  maxDownloads?: number | null;
  /** The export's own expiry — the share is clamped to not outlive it. */
  jobExpiresAt: string | null;
}

export interface CreatedShare {
  row: CourseExportShareRow;
  /** Plaintext token — returned once, never persisted. */
  token: string;
}

export function clampTtlHours(requested: number | null | undefined): number {
  const hours = requested && requested > 0 ? requested : SHARE_DEFAULT_TTL_HOURS;
  return Math.min(hours, SHARE_MAX_TTL_HOURS);
}

export function clampMaxDownloads(requested: number | null | undefined): number {
  const n = requested && requested > 0 ? Math.floor(requested) : SHARE_DEFAULT_MAX_DOWNLOADS;
  return Math.min(n, 1000);
}

// Share expiry = min(now + clamped TTL, export file's own expiry). A share
// must never outlive the file it points at.
export function computeShareExpiry(
  nowMs: number,
  requestedHours: number | null | undefined,
  jobExpiresAt: string | null,
): string {
  let expiresMs = nowMs + clampTtlHours(requestedHours) * 3_600_000;
  if (jobExpiresAt) {
    const jobMs = Date.parse(jobExpiresAt);
    if (Number.isFinite(jobMs)) expiresMs = Math.min(expiresMs, jobMs);
  }
  return new Date(expiresMs).toISOString();
}

// Pure validation of a loaded share + its job, in priority order. Keeps the
// security-critical ordering unit-testable without a DB.
export function evaluateShareState(
  share: Pick<
    CourseExportShareRow,
    'revokedAt' | 'lockedAt' | 'expiresAt' | 'downloadCount' | 'maxDownloads'
  >,
  job: { objectKey: string | null; status: string; expiresAt: string | null } | null,
  nowMs: number,
): { ok: true } | { ok: false; error: ShareValidationError } {
  if (share.revokedAt) return { ok: false, error: 'revoked' };
  if (share.lockedAt) return { ok: false, error: 'locked' };
  if (Date.parse(share.expiresAt) < nowMs) return { ok: false, error: 'expired' };
  if (share.downloadCount >= share.maxDownloads) return { ok: false, error: 'exhausted' };
  if (!job || job.status !== 'done' || !job.objectKey) return { ok: false, error: 'job_unavailable' };
  if (job.expiresAt && Date.parse(job.expiresAt) < nowMs) return { ok: false, error: 'job_unavailable' };
  return { ok: true };
}

export async function createExportShare(db: Db, input: CreateShareInput): Promise<CreatedShare> {
  const token = randomBase62(SHARE_TOKEN_LENGTH);
  const tokenHash = await sha256Hex(token);
  const passphraseHash =
    input.passphrase && input.passphrase.length > 0 ? await hashPassword(input.passphrase) : null;

  const expiresAt = computeShareExpiry(Date.now(), input.expiresInHours, input.jobExpiresAt);

  const [row] = await db
    .insert(courseExportShares)
    .values({
      exportJobId: input.exportJobId,
      courseId: input.courseId,
      createdById: input.createdById,
      tokenHash,
      passphraseHash,
      expiresAt,
      maxDownloads: clampMaxDownloads(input.maxDownloads),
    })
    .returning();
  if (!row) throw new Error('failed to create export share');
  return { row, token };
}

export async function listActiveShares(
  db: Db,
  exportJobId: string,
): Promise<CourseExportShareRow[]> {
  return db
    .select()
    .from(courseExportShares)
    .where(and(eq(courseExportShares.exportJobId, exportJobId), isNull(courseExportShares.revokedAt)))
    .orderBy(desc(courseExportShares.createdAt));
}

export async function revokeShare(
  db: Db,
  args: { shareId: string; courseId: string },
): Promise<boolean> {
  const result = await db
    .update(courseExportShares)
    .set({ revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(courseExportShares.id, args.shareId),
        eq(courseExportShares.courseId, args.courseId),
        isNull(courseExportShares.revokedAt),
      ),
    )
    .returning({ id: courseExportShares.id });
  return result.length > 0;
}

export type ShareValidationError =
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'exhausted'
  | 'locked'
  | 'job_unavailable'
  | 'passphrase_required'
  | 'passphrase_invalid';

export interface ResolvedShare {
  share: CourseExportShareRow;
  objectKey: string;
  courseId: string;
}

// Loads the share by token and re-validates it AND the underlying export job.
// Returns a discriminated result so callers map to the right HTTP status.
export async function resolveShareByToken(
  db: Db,
  token: string,
): Promise<
  | {
      ok: true;
      share: CourseExportShareRow;
      job: { objectKey: string | null; status: string; expiresAt: string | null; sizeBytes: number | null };
    }
  | { ok: false; error: ShareValidationError }
> {
  const tokenHash = await sha256Hex(token);
  const [share] = await db
    .select()
    .from(courseExportShares)
    .where(eq(courseExportShares.tokenHash, tokenHash))
    .limit(1);
  if (!share) return { ok: false, error: 'not_found' };

  const [job] = await db
    .select({
      objectKey: courseExportJobs.objectKey,
      status: courseExportJobs.status,
      expiresAt: courseExportJobs.expiresAt,
      sizeBytes: courseExportJobs.sizeBytes,
    })
    .from(courseExportJobs)
    .where(eq(courseExportJobs.id, share.exportJobId))
    .limit(1);

  const state = evaluateShareState(share, job ?? null, Date.now());
  if (!state.ok) return { ok: false, error: state.error };
  // state.ok implies the job exists and is downloadable (evaluateShareState
  // returns 'job_unavailable' otherwise), but narrow it for the type checker.
  if (!job) return { ok: false, error: 'job_unavailable' };
  return { ok: true, share, job };
}

// Verifies the passphrase (if the share has one). On failure the attempt
// counter is incremented and the share locked at the threshold in a SINGLE
// atomic UPDATE — the Neon HTTP driver autocommits each statement, so a
// read-then-write would let concurrent guesses race past the lockout (the only
// barrier once a capability token has leaked).
export async function checkPassphrase(
  db: Db,
  share: CourseExportShareRow,
  passphrase: string | undefined | null,
): Promise<{ ok: true } | { ok: false; error: 'passphrase_required' | 'passphrase_invalid' | 'locked' }> {
  if (!share.passphraseHash) return { ok: true };
  if (!passphrase) return { ok: false, error: 'passphrase_required' };
  const valid = await verifyPassword(passphrase, share.passphraseHash);
  if (valid) return { ok: true };
  const [row] = await db
    .update(courseExportShares)
    .set({
      failedAttempts: sql`${courseExportShares.failedAttempts} + 1`,
      lockedAt: sql`case when ${courseExportShares.failedAttempts} + 1 >= ${SHARE_MAX_FAILED_ATTEMPTS} then now() else ${courseExportShares.lockedAt} end`,
      updatedAt: sql`now()`,
    })
    .where(eq(courseExportShares.id, share.id))
    .returning({ lockedAt: courseExportShares.lockedAt });
  return { ok: false, error: row?.lockedAt ? 'locked' : 'passphrase_invalid' };
}

// Atomically claims a download slot: increments the count only if the share is
// still valid AND under its cap, in one UPDATE. Returns ok=false when no slot
// was available (cap reached / revoked / locked / expired between resolve and
// now). Reserving BEFORE minting the URL makes the cap race-free and keeps the
// FERPA disclosure count accurate.
export async function reserveDownloadSlot(
  db: Db,
  shareId: string,
): Promise<{ ok: true; downloadCount: number } | { ok: false }> {
  const [row] = await db
    .update(courseExportShares)
    .set({
      downloadCount: sql`${courseExportShares.downloadCount} + 1`,
      failedAttempts: 0,
      lastDownloadedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(courseExportShares.id, shareId),
        sql`${courseExportShares.downloadCount} < ${courseExportShares.maxDownloads}`,
        isNull(courseExportShares.revokedAt),
        isNull(courseExportShares.lockedAt),
        sql`${courseExportShares.expiresAt} > now()`,
      ),
    )
    .returning({ downloadCount: courseExportShares.downloadCount });
  return row ? { ok: true, downloadCount: row.downloadCount } : { ok: false };
}
