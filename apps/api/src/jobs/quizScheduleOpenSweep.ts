import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { alerts, quizScheduleMembers } from '../db/schema';
import type { AppBindings } from '../types';
import { recordAudit } from '../services/audit';
import { DEFAULT_EMAIL_FROM, sendEmailViaCloudflare } from '../services/email';
import { renderQuizScheduleOpenEmail } from '../services/quizScheduleOpenEmail';

/**
 * Don't notify for waves whose effective open is more than this far in the past
 * — bounds the scan and prevents a backfilled `notified_at IS NULL` row (e.g. a
 * member added long after the wave opened) from triggering a stale "now open"
 * blast. Such a student still sees the live briefing on their next visit.
 */
export const QUIZ_SCHEDULE_NOTIFY_LOOKBACK_HOURS = 24 * 7;

/** Cap rows per run so a large cohort can't time out the Worker; the rest are
 * picked up on the next tick. */
const BATCH_LIMIT = 500;

export interface QuizScheduleOpenSweepSummary {
  notified: number;
  emailed: number;
  failed: number;
}

interface EligibleRow {
  id: string;
  studentId: string;
  scheduleId: string;
  quizId: string;
  courseId: string;
  quizTitle: string;
  scheduleName: string | null;
  courseTitle: string;
  name: string;
  email: string;
  opensAt: string | null;
  closesAt: string | null;
}

/**
 * Frequent cron job: notify each student whose quiz tester schedule (wave) has
 * opened but who hasn't been told yet. Sends an in-app alert (deduped by the
 * partial-unique open-alert index) and a best-effort email, then stamps
 * `notified_at` so the next tick skips them.
 *
 * Idempotent: the `notified_at IS NULL` guard plus the per-row stamp means a
 * re-run only ever touches newly-opened, not-yet-notified members. Quiz access
 * itself is evaluated live at attempt time — this notification is a convenience,
 * not the gate. The remainder wave's members are dynamic (no member rows), so
 * they are covered by the in-app briefing rather than this email.
 */
export async function runQuizScheduleOpenSweep(
  db: Db,
  env: AppBindings,
  now: Date = new Date(),
): Promise<QuizScheduleOpenSweepSummary> {
  const nowIso = now.toISOString();
  const cutoffIso = new Date(
    now.getTime() - QUIZ_SCHEDULE_NOTIFY_LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const result = await db.execute(sql`
    SELECT m.id AS "id",
           m.student_id AS "studentId",
           m.schedule_id AS "scheduleId",
           m.quiz_id AS "quizId",
           q.course_id AS "courseId",
           q.title AS "quizTitle",
           s.name AS "scheduleName",
           c.title AS "courseTitle",
           u.name AS "name",
           u.email AS "email",
           COALESCE(s.start_time, q.start_time) AS "opensAt",
           COALESCE(s.end_time, q.end_time) AS "closesAt"
    FROM quiz_schedule_members m
    JOIN quiz_schedules s ON s.id = m.schedule_id
    JOIN quizzes q ON q.id = m.quiz_id
    JOIN courses c ON c.id = q.course_id
    JOIN users u ON u.id = m.student_id
    WHERE m.notified_at IS NULL
      AND q.status = 'published'
      AND COALESCE(s.start_time, q.start_time) IS NOT NULL
      AND COALESCE(s.start_time, q.start_time) <= ${nowIso}
      AND (COALESCE(s.end_time, q.end_time) IS NULL OR COALESCE(s.end_time, q.end_time) > ${nowIso})
      AND COALESCE(s.start_time, q.start_time) >= ${cutoffIso}
    ORDER BY COALESCE(s.start_time, q.start_time)
    LIMIT ${BATCH_LIMIT}
  `);
  const rows = result.rows as unknown as EligibleRow[];

  let notified = 0;
  let emailed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // In-app alert. ON CONFLICT DO NOTHING: the partial-unique open-alert index
      // (user, course, type WHERE open) means a second open quiz in the same
      // course is skipped — the email still informs the student.
      await db
        .insert(alerts)
        .values({
          userId: row.studentId,
          courseId: row.courseId,
          type: 'quiz_schedule_open',
          severity: 'info',
          status: 'open',
          title: `Your quiz is now open: ${row.quizTitle}`,
          body: row.scheduleName
            ? `Your wave "${row.scheduleName}" for "${row.quizTitle}" is now available.`
            : `"${row.quizTitle}" is now available.`,
          linkUrl: `/student/courses/${row.courseId}/quizzes/${row.quizId}`,
          metadataJson: { quizId: row.quizId, scheduleId: row.scheduleId },
        })
        .onConflictDoNothing();

      if (env.SEND_EMAIL && row.email) {
        try {
          const rendered = renderQuizScheduleOpenEmail({
            name: row.name,
            quizTitle: row.quizTitle,
            courseTitle: row.courseTitle,
            scheduleName: row.scheduleName,
            opensAt: row.opensAt,
            closesAt: row.closesAt,
            link: `/student/courses/${row.courseId}/quizzes/${row.quizId}`,
          });
          await sendEmailViaCloudflare(env.SEND_EMAIL, {
            to: row.email,
            from: env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
          emailed += 1;
        } catch (err) {
          // Email is best-effort; the in-app alert is the durable channel.
          console.error('quizSchedule.openEmail.failed', { memberId: row.id, err });
        }
      }

      await db
        .update(quizScheduleMembers)
        .set({ notifiedAt: nowIso, updatedAt: nowIso })
        .where(eq(quizScheduleMembers.id, row.id));
      notified += 1;
    } catch (err) {
      // Leave notified_at null so this member retries on the next tick.
      failed += 1;
      console.error('quizSchedule.openSweep.row.failed', { memberId: row.id, err });
    }
  }

  if (notified > 0) {
    await recordAudit(db, {
      actorType: 'system',
      action: 'quiz_schedule.notify_sweep',
      metadata: { notified, emailed, failed },
    });
  }

  return { notified, emailed, failed };
}
