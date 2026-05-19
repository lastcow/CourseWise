import type { Db } from '../../db/client';
import { aiGenerationEvents } from '../../db/schema';

/**
 * Append a progress event to a job. Errors are swallowed — recording
 * telemetry must never fail the parent step.
 */
export async function recordEvent(
  db: Db,
  jobId: string,
  artifactId: string | null,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): Promise<void> {
  try {
    await db.insert(aiGenerationEvents).values({
      jobId,
      artifactId,
      level,
      type,
      message,
      metadata: metadata ?? null,
    });
  } catch {
    // intentionally swallowed — see jsdoc
  }
}
