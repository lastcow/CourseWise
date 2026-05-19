import type { Db } from '../../db/client';
import { aiGenerationEvents } from '../../db/schema';

/**
 * Append a progress event to a job. Designed to be called from inside
 * Cloudflare Workflow step callbacks where a telemetry-insert failure
 * must NOT fail the parent step. Errors are logged and swallowed.
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
  } catch (err) {
    console.warn('recordEvent failed', {
      jobId,
      artifactId,
      type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
