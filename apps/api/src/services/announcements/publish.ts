import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type { AppBindings } from '../../types';
import {
  alerts,
  announcementTargets,
  announcements,
  courses,
  enrollments,
  groupMemberships,
  users,
} from '../../db/schema';
import { DEFAULT_EMAIL_FROM, sendEmailViaCloudflare } from '../email';
import { renderAnnouncementEmail } from '../announcementEmail';

type Recipient = { id: string; email: string | null; name: string; lang: string };

async function resolveRecipients(
  db: Db,
  ann: typeof announcements.$inferSelect,
): Promise<Recipient[]> {
  if (ann.audience === 'groups') {
    return db
      .selectDistinct({
        id: users.id,
        email: users.email,
        name: users.name,
        lang: users.preferredLanguage,
      })
      .from(announcementTargets)
      .innerJoin(groupMemberships, eq(groupMemberships.groupId, announcementTargets.groupId))
      .innerJoin(users, eq(users.id, groupMemberships.studentId))
      .where(eq(announcementTargets.announcementId, ann.id));
  }
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      lang: users.preferredLanguage,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.courseId, ann.courseId), eq(enrollments.status, 'enrolled')));
}

/**
 * Publish an announcement: flip status, then fan out to the audience via a
 * rolling in-app alert (one open 'announcement' alert per student per course,
 * refreshed to the latest) and a best-effort localized email. Idempotent —
 * re-running keeps the original publishedAt and just refreshes the fan-out.
 */
export async function publishAnnouncement(
  db: Db,
  env: AppBindings,
  announcementId: string,
): Promise<{ recipients: number; emailed: number }> {
  const ann = (
    await db.select().from(announcements).where(eq(announcements.id, announcementId)).limit(1)
  )[0];
  if (!ann) return { recipients: 0, emailed: 0 };

  const nowIso = new Date().toISOString();
  await db
    .update(announcements)
    .set({
      status: 'published',
      publishedAt: ann.publishedAt ?? nowIso,
      publishAt: null,
      updatedAt: nowIso,
    })
    .where(eq(announcements.id, ann.id));

  const course = (
    await db.select({ title: courses.title }).from(courses).where(eq(courses.id, ann.courseId)).limit(1)
  )[0];
  const courseTitle = course?.title ?? 'your course';
  const recipients = await resolveRecipients(db, ann);
  if (recipients.length === 0) return { recipients: 0, emailed: 0 };

  const link = `/student/courses/${ann.courseId}/announcements`;
  const bodyText = `New announcement in ${courseTitle}`;
  // Priority bumps the alert severity so high/urgent announcements stand out.
  const severity: 'info' | 'warning' | 'critical' =
    ann.priority === 'urgent' ? 'critical' : ann.priority === 'high' ? 'warning' : 'info';

  // Rolling in-app alert: one open 'announcement' alert per (student, course),
  // refreshed to this announcement. Matches the partial-unique open-alert index.
  await db
    .insert(alerts)
    .values(
      recipients.map((rec) => ({
        userId: rec.id,
        courseId: ann.courseId,
        type: 'announcement' as const,
        severity,
        status: 'open' as const,
        title: ann.title,
        body: bodyText,
        linkUrl: link,
        metadataJson: { announcementId: ann.id },
      })),
    )
    .onConflictDoUpdate({
      target: [alerts.userId, alerts.courseId, alerts.type],
      targetWhere: sql`${alerts.status} = 'open'`,
      set: {
        title: ann.title,
        body: bodyText,
        severity,
        linkUrl: link,
        readAt: null,
        status: 'open',
        metadataJson: { announcementId: ann.id },
        updatedAt: nowIso,
      },
    });

  let emailed = 0;
  if (env.SEND_EMAIL) {
    for (const rec of recipients) {
      if (!rec.email) continue;
      try {
        const m = renderAnnouncementEmail(rec.lang, {
          name: rec.name,
          courseTitle,
          title: ann.title,
          link,
        });
        await sendEmailViaCloudflare(env.SEND_EMAIL, {
          to: rec.email,
          from: env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
          subject: m.subject,
          html: m.html,
          text: m.text,
        });
        emailed += 1;
      } catch (err) {
        // Email is best-effort; the in-app alert is the durable channel.
        console.error('announcement.email.failed', { userId: rec.id, err });
      }
    }
  }
  return { recipients: recipients.length, emailed };
}
