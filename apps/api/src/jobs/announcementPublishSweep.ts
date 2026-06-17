import { and, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { AppBindings } from '../types';
import { announcements } from '../db/schema';
import { publishAnnouncement } from '../services/announcements/publish';

/**
 * Publish any scheduled announcements whose publishAt has arrived. Idempotent:
 * publishAnnouncement flips status to 'published', so a row is picked up once.
 */
export async function runAnnouncementPublishSweep(
  db: Db,
  env: AppBindings,
): Promise<{ published: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const due = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(eq(announcements.status, 'scheduled'), lte(announcements.publishAt, nowIso)));

  let published = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await publishAnnouncement(db, env, row.id);
      published += 1;
    } catch (err) {
      failed += 1;
      console.error('announcement.publishSweep.item.failed', { id: row.id, err });
    }
  }
  return { published, failed };
}
