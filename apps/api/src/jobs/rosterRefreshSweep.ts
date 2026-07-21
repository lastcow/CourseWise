import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { AppBindings } from '../types';
import { courseTeachers, lmsConnections, lmsCourseLinks, lmsSyncRuns } from '../db/schema';
import { recordAudit } from '../services/audit';
import { CanvasAuthError, CanvasClient } from '../services/lms/canvas/client';
import { refreshRoster } from '../services/lms/canvas/roster';
import { decryptCanvasToken } from '../services/lms/canvas/tokens';

/**
 * Nightly Canvas roster reference refresh (v2 §7.1): every course link with
 * rosterRefreshEnabled and a still-future rosterRefreshUntil gets one
 * roster_refresh run. Runs execute inline (not via the Workflow) but write
 * the same lms_sync_runs rows, so the teacher's run history shows them, and
 * each successful ingest writes a system audit row (v2 §九.1: inbound PII
 * flows are always accounted for, even actorless ones).
 *
 * Serial by construction: one loop, ordered by connection, so a teacher's
 * token never sees concurrent requests from this sweep (the CanvasClient
 * contract). A dead token (401) marks the connection precisely and skips the
 * rest of that teacher's links. The token is only used while its owner still
 * teaches the linked course — a removed teacher's token must not keep
 * pulling that course's roster.
 */
export async function runRosterRefreshSweep(
  db: Db,
  env: AppBindings,
): Promise<{ refreshed: number; failed: number; skipped: number }> {
  const nowIso = new Date().toISOString();
  const due = await db
    .select({
      linkId: lmsCourseLinks.id,
      courseId: lmsCourseLinks.courseId,
      externalCourseId: lmsCourseLinks.externalCourseId,
      connectionId: lmsConnections.id,
      baseUrl: lmsConnections.baseUrl,
      tokenEnc: lmsConnections.tokenEnc,
    })
    .from(lmsCourseLinks)
    .innerJoin(lmsConnections, eq(lmsCourseLinks.connectionId, lmsConnections.id))
    .innerJoin(
      courseTeachers,
      and(
        eq(courseTeachers.courseId, lmsCourseLinks.courseId),
        eq(courseTeachers.teacherId, lmsConnections.teacherId),
      ),
    )
    .where(
      and(
        eq(lmsCourseLinks.rosterRefreshEnabled, true),
        gt(lmsCourseLinks.rosterRefreshUntil, nowIso),
        eq(lmsConnections.status, 'active'),
        ne(lmsConnections.tokenEnc, ''),
      ),
    )
    .orderBy(lmsCourseLinks.connectionId);
  if (due.length === 0) return { refreshed: 0, failed: 0, skipped: 0 };

  // One query finds every link with a live run (teacher-triggered runs win —
  // tonight is not urgent). Check-then-run still races a run created after
  // this query; the overlap is bounded and refreshRoster upserts idempotently.
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const busyLinkIds = new Set(
    (
      await db
        .select({ courseLinkId: lmsSyncRuns.courseLinkId })
        .from(lmsSyncRuns)
        .where(
          and(
            inArray(
              lmsSyncRuns.courseLinkId,
              due.map((l) => l.linkId),
            ),
            inArray(lmsSyncRuns.status, ['pending', 'running']),
            gt(lmsSyncRuns.createdAt, staleCutoff),
          ),
        )
    ).map((r) => r.courseLinkId),
  );

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  const deadConnections = new Set<string>();

  for (const link of due) {
    if (deadConnections.has(link.connectionId) || busyLinkIds.has(link.linkId)) {
      skipped += 1;
      continue;
    }

    const [run] = await db
      .insert(lmsSyncRuns)
      .values({
        connectionId: link.connectionId,
        courseLinkId: link.linkId,
        kind: 'roster_refresh',
        status: 'running',
        startedAt: new Date().toISOString(),
      })
      .returning({ id: lmsSyncRuns.id });
    if (!run) {
      failed += 1;
      continue;
    }
    try {
      const token = await decryptCanvasToken(env, link.tokenEnc);
      const client = new CanvasClient(link.baseUrl, token);
      const roster = await refreshRoster(db, client, {
        courseLinkId: link.linkId,
        externalCourseId: link.externalCourseId,
      });
      const done = new Date().toISOString();
      await db
        .update(lmsSyncRuns)
        .set({ status: 'done', summaryJson: { roster }, completedAt: done, updatedAt: done })
        .where(eq(lmsSyncRuns.id, run.id));
      await recordAudit(db, {
        actorType: 'system',
        action: 'canvas.roster.refresh',
        target: run.id,
        metadata: { courseId: link.courseId, courseLinkId: link.linkId, sweep: true },
      });
      refreshed += 1;
    } catch (err) {
      failed += 1;
      const done = new Date().toISOString();
      await db
        .update(lmsSyncRuns)
        .set({
          status: 'failed',
          error: String(err instanceof Error ? err.message : err).slice(0, 500),
          completedAt: done,
          updatedAt: done,
        })
        .where(eq(lmsSyncRuns.id, run.id));
      if (err instanceof CanvasAuthError) {
        deadConnections.add(link.connectionId);
        await db
          .update(lmsConnections)
          .set({ status: err.kind, updatedAt: done })
          .where(eq(lmsConnections.id, link.connectionId));
      }
      console.error('canvas.rosterSweep.item.failed', { linkId: link.linkId, err });
    }
  }
  return { refreshed, failed, skipped };
}
