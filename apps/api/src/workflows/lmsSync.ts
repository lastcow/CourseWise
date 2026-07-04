import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { lmsConnections, lmsCourseLinks, lmsSyncRuns } from '../db/schema';
import { CanvasAuthError, CanvasClient } from '../services/lms/canvas/client';
import {
  importCourseStructure,
  type ImportStructureSummary,
} from '../services/lms/canvas/importCourse';
import { decryptCanvasToken } from '../services/lms/canvas/tokens';
import type { AppBindings } from '../types';

export interface LmsSyncParams {
  runId: string;
  courseLinkId: string;
  kind: 'initial_import';
}

// Initial Canvas course import (P1). Fetch + DB writes live inside single
// steps so Canvas payloads never cross a step boundary — only small summaries
// do. The decrypted token also never leaves a step (recreated per step).
// A terminal Canvas 401 marks the connection status precisely
// (invalid/expired/revoked) and fails the run without step retries burning
// requests against a dead token.
// STRUCTURE ONLY by explicit product decision: the import touches zero
// student data — no accounts, and no roster snapshot either. The roster
// reference fetch happens later, as an explicit action when identity
// matching starts (P2).
export class LmsSyncWorkflow extends WorkflowEntrypoint<AppBindings, LmsSyncParams> {
  override async run(event: WorkflowEvent<LmsSyncParams>, step: WorkflowStep): Promise<void> {
    const { runId, courseLinkId } = event.payload;
    const env = this.env;

    try {
      const link = await step.do('mark-running', async () => {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(lmsSyncRuns)
          .set({
            status: 'running',
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(lmsSyncRuns.id, runId));
        const [row] = await db
          .select({
            courseId: lmsCourseLinks.courseId,
            externalCourseId: lmsCourseLinks.externalCourseId,
            connectionId: lmsCourseLinks.connectionId,
          })
          .from(lmsCourseLinks)
          .where(eq(lmsCourseLinks.id, courseLinkId))
          .limit(1);
        if (!row) throw new Error('course link not found');
        return row;
      });

      const makeClient = async () => {
        const db = createDb(env.DATABASE_URL);
        const [conn] = await db
          .select({
            baseUrl: lmsConnections.baseUrl,
            tokenEnc: lmsConnections.tokenEnc,
            status: lmsConnections.status,
          })
          .from(lmsConnections)
          .where(eq(lmsConnections.id, link.connectionId))
          .limit(1);
        if (!conn) throw new Error('connection not found');
        const token = await decryptCanvasToken(env, conn.tokenEnc);
        return new CanvasClient(conn.baseUrl, token);
      };

      const structure: ImportStructureSummary = await step.do(
        'import-structure',
        { retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' } },
        async () => {
          const db = createDb(env.DATABASE_URL);
          const client = await makeClient();
          try {
            return await importCourseStructure(db, client, {
              courseId: link.courseId,
              courseLinkId,
              externalCourseId: link.externalCourseId,
            });
          } catch (err) {
            await this.markAuthFailure(env, link.connectionId, err);
            throw err;
          }
        },
      );

      await step.do('finalize', async () => {
        const db = createDb(env.DATABASE_URL);
        const now = new Date().toISOString();
        await db
          .update(lmsSyncRuns)
          .set({
            status: 'done',
            summaryJson: { structure },
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(lmsSyncRuns.id, runId));
        await db
          .update(lmsCourseLinks)
          .set({ importedAt: now, importRunId: runId, updatedAt: now })
          .where(eq(lmsCourseLinks.id, courseLinkId));
      });
    } catch (err) {
      // Record the failure so it's visible in the sync-runs list, then rethrow
      // so the Workflow runtime marks the run failed (and can retry).
      try {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(lmsSyncRuns)
          .set({
            status: 'failed',
            error: String(err instanceof Error ? err.message : err).slice(0, 500),
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(lmsSyncRuns.id, runId));
      } catch {
        /* best-effort */
      }
      throw err;
    }
  }

  // A Canvas 401 means the token is dead — record precisely which way so the
  // UI can show "reconnect Canvas" with the right message and nightly jobs
  // pause (v2 §3.2 state machine).
  private async markAuthFailure(env: AppBindings, connectionId: string, err: unknown): Promise<void> {
    if (!(err instanceof CanvasAuthError)) return;
    try {
      const db = createDb(env.DATABASE_URL);
      await db
        .update(lmsConnections)
        .set({ status: err.kind, updatedAt: new Date().toISOString() })
        .where(eq(lmsConnections.id, connectionId));
    } catch {
      /* best-effort */
    }
  }
}
