import { eq } from 'drizzle-orm';
import { courseSubmissionsClosed } from '@coursewise/shared';
import { courses } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import type { Db } from '../db/client';

/**
 * Throw COURSE_ENDED when a course has the "lock submissions after end" option
 * enabled and its end date has passed. Called at every student submission entry
 * point (assignment submit, quiz attempt start, discussion post) so a finished
 * course is uniformly read-only for students. The threshold math lives in the
 * shared helper so the API and the web client agree to the day.
 */
export async function assertCourseAcceptsSubmissions(db: Db, courseId: string): Promise<void> {
  const [course] = await db
    .select({
      endDate: courses.endDate,
      disableSubmissionsAfterEnd: courses.disableSubmissionsAfterEnd,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (course && courseSubmissionsClosed(course)) {
    throw new ApiException(
      409,
      ERROR_CODES.COURSE_ENDED,
      'The course has ended and no longer accepts submissions',
    );
  }
}
