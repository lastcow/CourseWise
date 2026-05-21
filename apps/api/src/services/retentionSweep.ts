import { and, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  aiGenerationJobs,
  attendanceRecords,
  auditLogs,
  gammaGenerationJobs,
  refreshTokens,
} from '../db/schema';
import { recordAudit } from './audit';

/**
 * FERPA roadmap item #9 — nightly retention sweep.
 *
 * Six idempotent operations. Each uses an absolute date cutoff so re-runs
 * (or partial-failure restarts) are safe. The whole sweep is wrapped in a
 * single audit row at the end so we can see in /me/records/disclosures
 * (well, in the operator audit log — sweeps aren't FERPA disclosures) that
 * the policy is actually running.
 *
 * Retention windows are intentionally conservative; bump them down as the
 * operations team gets comfortable. The matching policy needs to be
 * documented on the Privacy Policy page (roadmap item #14).
 *
 * Important: audit_logs rows with disclosed_student_id IS NOT NULL are
 * FERPA §99.32(a) disclosure records and MUST be kept as long as the
 * student's records are maintained. We never delete audit rows here — only
 * null out the IP/user_agent fingerprints once they're no longer useful
 * for incident response.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DEFAULTS = {
  // IP / user-agent — keep 90 days, then anonymise. Plenty of room for
  // incident-response forensics; FERPA cares mostly about indefinite storage.
  fingerprintRetentionDays: 90,
  // Expired or revoked refresh tokens — keep 30 days for support
  // ("my account got hacked, when did it start") then hard-delete.
  expiredRefreshTokenGraceDays: 30,
  // AI / Gamma generation jobs — request bodies can carry course context;
  // 1 year is the audit window most schools quote.
  aiJobRetentionDays: 365,
};

export interface RetentionSweepSummary {
  auditLogsFingerprintsNulled: number;
  attendanceFingerprintsNulled: number;
  refreshTokenFingerprintsNulled: number;
  expiredRefreshTokensDeleted: number;
  aiGenerationJobsDeleted: number;
  gammaGenerationJobsDeleted: number;
  runAt: string;
}

export type RetentionConfig = typeof RETENTION_DEFAULTS;

function cutoffIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

// `db.update(...).returning()` lets us count rows touched without a separate
// SELECT. Length of the returned array == affected row count.

export async function nullOldAuditLogFingerprints(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.fingerprintRetentionDays, now);
  // Skip rows that already have both fields null — saves churn on already-
  // anonymised rows. We never touch audit_logs.disclosed_student_id; this
  // only edits IP/UA.
  const updated = await db
    .update(auditLogs)
    .set({ ip: null, userAgent: null })
    .where(
      and(
        lt(auditLogs.createdAt, cutoff),
        or(isNotNull(auditLogs.ip), isNotNull(auditLogs.userAgent)),
      ),
    )
    .returning({ id: auditLogs.id });
  return updated.length;
}

export async function nullOldAttendanceFingerprints(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.fingerprintRetentionDays, now);
  const updated = await db
    .update(attendanceRecords)
    .set({ ipAddress: null })
    .where(
      and(
        lt(attendanceRecords.recordedAt, cutoff),
        isNotNull(attendanceRecords.ipAddress),
      ),
    )
    .returning({ id: attendanceRecords.id });
  return updated.length;
}

export async function nullOldRefreshTokenFingerprints(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.fingerprintRetentionDays, now);
  const updated = await db
    .update(refreshTokens)
    .set({ ip: null, userAgent: null })
    .where(
      and(
        lt(refreshTokens.createdAt, cutoff),
        or(isNotNull(refreshTokens.ip), isNotNull(refreshTokens.userAgent)),
      ),
    )
    .returning({ id: refreshTokens.id });
  return updated.length;
}

export async function deleteExpiredRefreshTokens(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.expiredRefreshTokenGraceDays, now);
  // Either: revoked & past grace, OR expired & past grace. drizzle's `or` +
  // `and` keeps this readable; the resulting SQL hits the same row at most
  // once.
  const deleted = await db
    .delete(refreshTokens)
    .where(
      or(
        and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, cutoff)),
        lt(refreshTokens.expiresAt, cutoff),
      ),
    )
    .returning({ id: refreshTokens.id });
  return deleted.length;
}

export async function deleteOldAiGenerationJobs(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.aiJobRetentionDays, now);
  // Cascades to ai_generation_artifacts and ai_generation_events (both have
  // FK ON DELETE CASCADE on job_id). No extra cleanup required.
  const deleted = await db
    .delete(aiGenerationJobs)
    .where(lt(aiGenerationJobs.createdAt, cutoff))
    .returning({ id: aiGenerationJobs.id });
  return deleted.length;
}

export async function deleteOldGammaGenerationJobs(
  db: Db,
  now: Date,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<number> {
  const cutoff = cutoffIso(config.aiJobRetentionDays, now);
  const deleted = await db
    .delete(gammaGenerationJobs)
    .where(lt(gammaGenerationJobs.createdAt, cutoff))
    .returning({ id: gammaGenerationJobs.id });
  return deleted.length;
}

export async function runRetentionSweep(
  db: Db,
  config: RetentionConfig = RETENTION_DEFAULTS,
): Promise<RetentionSweepSummary> {
  const now = new Date();
  // Run sweeps sequentially rather than in parallel: each is a write against
  // a different table, but a single Worker invocation has limited subrequest
  // budget — keeping it serial avoids burning the budget if one is slow.
  const auditLogsFingerprintsNulled = await nullOldAuditLogFingerprints(db, now, config);
  const attendanceFingerprintsNulled = await nullOldAttendanceFingerprints(db, now, config);
  const refreshTokenFingerprintsNulled = await nullOldRefreshTokenFingerprints(db, now, config);
  const expiredRefreshTokensDeleted = await deleteExpiredRefreshTokens(db, now, config);
  const aiGenerationJobsDeleted = await deleteOldAiGenerationJobs(db, now, config);
  const gammaGenerationJobsDeleted = await deleteOldGammaGenerationJobs(db, now, config);

  const summary: RetentionSweepSummary = {
    auditLogsFingerprintsNulled,
    attendanceFingerprintsNulled,
    refreshTokenFingerprintsNulled,
    expiredRefreshTokensDeleted,
    aiGenerationJobsDeleted,
    gammaGenerationJobsDeleted,
    runAt: now.toISOString(),
  };

  await recordAudit(db, {
    actorType: 'system',
    action: 'retention.sweep',
    metadata: { ...summary },
  });

  return summary;
}

// Suppress unused-import lint warning when sql isn't reached from any sweep
// (we keep the import for future use cases that need raw expressions).
void sql;
