import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { attendanceSessions } from '../db/schema';
import { recordAudit } from '../services/audit';

/**
 * An attendance session is auto-closed once its start is this many hours in the
 * past. Sessions store only a start (`session_date`) — there is no end time or
 * duration — and the self-sign window (`absent_after_minutes`) is optional, so
 * keying purely on elapsed hours avoids both null thresholds and timezone math:
 * anything still `open` a full day after it began is treated as stale.
 */
export const ATTENDANCE_AUTO_CLOSE_AFTER_HOURS = 24;

export interface AttendanceAutoCloseSummary {
  closed: number;
}

/**
 * The cutoff timestamp: sessions started at or before this are stale. Extracted
 * as a pure helper so the elapsed-hours arithmetic is unit-testable without a db.
 */
export function attendanceAutoCloseCutoff(now: Date): string {
  return new Date(
    now.getTime() - ATTENDANCE_AUTO_CLOSE_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

/**
 * Nightly cron job: flip every `open` attendance session that started more than
 * {@link ATTENDANCE_AUTO_CLOSE_AFTER_HOURS} ago to `closed`. Mirrors the manual
 * close route (status + closed_at + updated_at) but skips the per-request auth
 * since this is a system job.
 *
 * Idempotent: the absolute-time predicate means a re-run only ever touches rows
 * that have newly crossed the cutoff, and the `status = 'open'` guard skips ones
 * already closed. Closing only flips the status — it never deletes the session
 * or touches attendance records.
 */
export async function closeExpiredAttendanceSessions(
  db: Db,
  now: Date = new Date(),
): Promise<AttendanceAutoCloseSummary> {
  const nowIso = now.toISOString();
  const cutoffIso = attendanceAutoCloseCutoff(now);

  const closedRows = await db
    .update(attendanceSessions)
    .set({ status: 'closed', closedAt: nowIso, updatedAt: nowIso })
    .where(
      and(
        eq(attendanceSessions.status, 'open'),
        lt(attendanceSessions.sessionDate, cutoffIso),
      ),
    )
    .returning({ id: attendanceSessions.id });

  const summary: AttendanceAutoCloseSummary = { closed: closedRows.length };

  // Parity with the retention sweep: record one system audit row, but only when
  // something actually closed — a nightly no-op shouldn't pad the audit log.
  if (summary.closed > 0) {
    await recordAudit(db, {
      actorType: 'system',
      action: 'attendance_session.auto_close',
      metadata: { ...summary, cutoff: cutoffIso },
    });
  }

  return summary;
}
