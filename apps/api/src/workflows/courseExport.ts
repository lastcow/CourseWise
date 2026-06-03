import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { courseExportJobs, courses, users } from '../db/schema';
import {
  buildAndStoreZip,
  exportObjectKey,
  gatherCourseExport,
} from '../services/courseExport';
import { renderCourseExportEmail } from '../services/courseExportEmail';
import { DEFAULT_EMAIL_FROM, sendEmailViaCloudflare } from '../services/email';
import type { AppBindings } from '../types';

export interface CourseExportParams {
  jobId: string;
  courseId: string;
  /** Web app origin captured at request time, for the emailed download link. */
  appBaseUrl: string;
}

const EXPORT_TTL_DAYS = 7;

export class CourseExportWorkflow extends WorkflowEntrypoint<AppBindings, CourseExportParams> {
  override async run(event: WorkflowEvent<CourseExportParams>, step: WorkflowStep): Promise<void> {
    const { jobId, courseId, appBaseUrl } = event.payload;
    const env = this.env;

    try {
      await step.do('mark-running', async () => {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(courseExportJobs)
          .set({ status: 'running', updatedAt: new Date().toISOString() })
          .where(eq(courseExportJobs.id, jobId));
      });

      // Gather + zip live in ONE step so the (potentially large) manifest never
      // has to cross a workflow step boundary — only the small size result does.
      const objectKey = exportObjectKey(courseId, jobId);
      const built = await step.do(
        'build',
        { retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' } },
        async () => {
          if (!env.COURSE_FILES) throw new Error('R2 bucket binding (COURSE_FILES) is missing');
          const db = createDb(env.DATABASE_URL);
          const manifest = await gatherCourseExport(db, courseId);
          if (!manifest) throw new Error('course not found');
          return buildAndStoreZip(env.COURSE_FILES, manifest, objectKey);
        },
      );

      await step.do('finalize', async () => {
        const db = createDb(env.DATABASE_URL);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + EXPORT_TTL_DAYS * 86_400_000).toISOString();
        await db
          .update(courseExportJobs)
          .set({
            status: 'done',
            objectKey,
            sizeBytes: built.sizeBytes,
            expiresAt,
            completedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .where(eq(courseExportJobs.id, jobId));

        // Best-effort email to the requester with an authenticated download link.
        const [job] = await db
          .select({ requestedById: courseExportJobs.requestedById })
          .from(courseExportJobs)
          .where(eq(courseExportJobs.id, jobId))
          .limit(1);
        if (!job?.requestedById || !env.SEND_EMAIL) return;
        const [u] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, job.requestedById))
          .limit(1);
        const [course] = await db
          .select({ title: courses.title })
          .from(courses)
          .where(eq(courses.id, courseId))
          .limit(1);
        if (!u?.email) return;
        const linkUrl = `${appBaseUrl.replace(/\/$/, '')}/teacher/courses/${courseId}/settings?export=${jobId}`;
        const tmpl = renderCourseExportEmail({ courseName: course?.title ?? 'your course', linkUrl });
        try {
          await sendEmailViaCloudflare(env.SEND_EMAIL, {
            to: u.email,
            from: env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
            subject: tmpl.subject,
            html: tmpl.html,
            text: tmpl.text,
          });
        } catch (err) {
          console.error('course.export.email.failed', { jobId, err });
        }
      });
    } catch (err) {
      // Record the failure so it's visible in the Exports list, then rethrow so
      // the Workflow runtime marks the run failed (and can retry).
      try {
        const db = createDb(env.DATABASE_URL);
        await db
          .update(courseExportJobs)
          .set({
            status: 'failed',
            error: String(err instanceof Error ? err.message : err).slice(0, 500),
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(courseExportJobs.id, jobId));
      } catch {
        /* best-effort */
      }
      throw err;
    }
  }
}
