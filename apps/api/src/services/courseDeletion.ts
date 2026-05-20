import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  assignments,
  assignmentSubmissions,
  attendanceSessions,
  discussionPosts,
  discussionTopics,
  enrollments,
  fileAssets,
  modules,
  quizAttempts,
  quizzes,
  readingMaterials,
} from '../db/schema';

export type ChildCounts = {
  enrollments: number;
  modules: number;
  readingMaterials: number;
  assignments: number;
  submissions: number;
  quizzes: number;
  quizAttempts: number;
  discussionTopics: number;
  discussionPosts: number;
  attendanceSessions: number;
  fileCount: number;
  fileBytes: number;
};

/**
 * Returns row counts for every course-scoped child table.
 *
 * Consumed by:
 *   1. `GET /api/courses/:id/deletion-preview` — shows the user what will be wiped.
 *   2. The DELETE handler — written into `course_deletion_log.child_counts` as an
 *      audit snapshot.
 *
 * All counts are computed in a single round-trip via a flat SELECT with
 * correlated subqueries. `fileBytes` is the sum of `file_assets.size_bytes` for
 * the course; null/missing sizes count as 0 thanks to `coalesce`.
 *
 * Note on serialization: Postgres `bigint` (used for `sum`) can serialize as a
 * string through the neon-http driver. We cast each count to `int` and coerce
 * `fileBytes` to a JS `number` in this function so the consumer always sees
 * numeric values. `fileBytes` may exceed `Number.MAX_SAFE_INTEGER` for absurdly
 * large courses, but practical file totals stay well within JS number range.
 */
export async function courseChildCounts(db: Db, courseId: string): Promise<ChildCounts> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM ${enrollments} WHERE course_id = ${courseId})::int AS "enrollments",
      (SELECT count(*) FROM ${modules} WHERE course_id = ${courseId})::int AS "modules",
      (SELECT count(*) FROM ${readingMaterials} WHERE course_id = ${courseId})::int AS "readingMaterials",
      (SELECT count(*) FROM ${assignments} WHERE course_id = ${courseId})::int AS "assignments",
      (SELECT count(*) FROM ${assignmentSubmissions} s
         JOIN ${assignments} a ON a.id = s.assignment_id
         WHERE a.course_id = ${courseId})::int AS "submissions",
      (SELECT count(*) FROM ${quizzes} WHERE course_id = ${courseId})::int AS "quizzes",
      (SELECT count(*) FROM ${quizAttempts} att
         JOIN ${quizzes} q ON q.id = att.quiz_id
         WHERE q.course_id = ${courseId})::int AS "quizAttempts",
      (SELECT count(*) FROM ${discussionTopics} WHERE course_id = ${courseId})::int AS "discussionTopics",
      (SELECT count(*) FROM ${discussionPosts} dp
         JOIN ${discussionTopics} dt ON dt.id = dp.topic_id
         WHERE dt.course_id = ${courseId})::int AS "discussionPosts",
      (SELECT count(*) FROM ${attendanceSessions} WHERE course_id = ${courseId})::int AS "attendanceSessions",
      (SELECT count(*) FROM ${fileAssets} WHERE course_id = ${courseId})::int AS "fileCount",
      (SELECT coalesce(sum(size_bytes), 0) FROM ${fileAssets} WHERE course_id = ${courseId})::bigint AS "fileBytes"
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error('courseChildCounts: empty result from count query');
  }

  return {
    enrollments: Number(row.enrollments ?? 0),
    modules: Number(row.modules ?? 0),
    readingMaterials: Number(row.readingMaterials ?? 0),
    assignments: Number(row.assignments ?? 0),
    submissions: Number(row.submissions ?? 0),
    quizzes: Number(row.quizzes ?? 0),
    quizAttempts: Number(row.quizAttempts ?? 0),
    discussionTopics: Number(row.discussionTopics ?? 0),
    discussionPosts: Number(row.discussionPosts ?? 0),
    attendanceSessions: Number(row.attendanceSessions ?? 0),
    fileCount: Number(row.fileCount ?? 0),
    fileBytes: Number(row.fileBytes ?? 0),
  };
}
