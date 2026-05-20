# Course Hard-Delete (Danger Zone) — Design

## Goal

Let a course's primary teacher (and any admin) permanently delete a course from CourseWise. "Permanently" means FERPA-grade: the row in `courses` is removed, every child record across the ~23 dependent tables is cascade-deleted in the same transaction, and the matching R2 object prefix is wiped shortly after. The action is exposed as a clearly-marked "Danger zone" section on the existing course settings page and as a row-level action on the admin courses page.

## Why

CourseWise currently supports only soft archive plus a guarded `DELETE /courses/:id` that refuses to run if any students are enrolled. That guard means in practice no real course can ever be removed once a term has started, leaving teachers and admins with no way to honour deletion requests (FERPA right-to-amend, end-of-term cleanup, accidental-course removal). The DB schema already cascades FK relationships correctly for every table that references `courses.id`, so the destructive heavy-lifting is wired — the missing pieces are the safety UX, R2 cleanup, and an audit trail.

## Scope

In scope:

- A teacher-facing "Danger zone" section in `TeacherCourseSettings.tsx` with a type-the-code confirmation dialog.
- An admin row-level "Delete course…" action on `AdminCoursesPage.tsx`, opening the same dialog.
- `DELETE /api/courses/:courseId` accepts a `confirmCode` body; relaxes the existing "enrollments must be empty" guard; runs in a single transaction with audit-row insert and R2-cleanup-job insert.
- A `GET /api/courses/:courseId/deletion-preview` endpoint that returns child-row counts to populate the confirmation dialog.
- R2 object-storage cleanup under `courses/{courseId}/` via `ctx.waitUntil`, status-tracked in a new `r2_cleanup_jobs` table.
- An admin-only `POST /api/admin/r2-cleanup-jobs/:id/retry` endpoint plus a small cleanup-status badge on `AdminCoursesPage` for failed jobs.
- A persistent `course_deletion_log` audit trail (metadata only — no student PII).

Out of scope:

- Undo / soft-delete recovery; deletion approval queues; bulk multi-course delete; R2 bucket lifecycle rules; cron-based cleanup polling.

## Authorization

Reuses the existing `canWriteCourse()` service check — admin OR primary teacher only. Co-teachers see the Danger zone with the delete button disabled and a tooltip ("Only the primary teacher or an admin can delete this course"). Archive remains gated by the same check; the two destructive actions stay aligned.

## Flow

1. User clicks "Delete this course" in the Danger zone (or "Delete course…" in the admin row menu).
2. Web calls `GET /api/courses/:courseId/deletion-preview` for the child-row counts.
3. Modal opens listing what will be wiped and asking the user to type the course code verbatim. The "Delete forever" button is disabled until the typed string matches `course.code` exactly.
4. On confirm, web calls `DELETE /api/courses/:courseId` with `{ confirmCode }` in the JSON body.
5. The API authorizes, validates the code, then in a single transaction:
   - Inserts a `course_deletion_log` row (actor, course id + code + title snapshot, child counts, timestamp).
   - Deletes the `courses` row — FK cascades remove every child record.
   - Inserts an `r2_cleanup_jobs` row with `status='pending'`.
6. The handler returns `204` and schedules `ctx.waitUntil(runR2Cleanup(jobId, courseId))`.
7. The Worker continues running after the response: lists every R2 object under `courses/{courseId}/`, deletes them in batches of 1000, then updates the job row to `done`. On failure it sets `status='failed'` with the error string.
8. Admin sees failed jobs in a status badge on `AdminCoursesPage` and can hit "Retry cleanup" to re-run.

## Database

New tables, migration `0014_course_deletion.sql`:

```sql
CREATE TABLE course_deletion_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL,            -- no FK; row outlives course
  course_code   text NOT NULL,
  course_title  text NOT NULL,
  deleted_by    uuid NOT NULL REFERENCES users(id),
  deleted_at    timestamptz NOT NULL DEFAULT now(),
  child_counts  jsonb NOT NULL            -- {"enrollments":47,"modules":12,...}
);

CREATE TABLE r2_cleanup_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL,            -- used as R2 key prefix
  status        text NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
  attempts      int  NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX r2_cleanup_jobs_status_created ON r2_cleanup_jobs (status, created_at)
  WHERE status IN ('pending', 'running', 'failed');
```

Both tables intentionally have no FK to `courses` — the audit trail and cleanup job must survive the row that triggered them.

## API

`DELETE /api/courses/:courseId`
Body: `{ confirmCode: string }`
Returns: `204 No Content`
Errors: `400` if code mismatch, `403` if not primary teacher or admin, `404` if course missing.

`GET /api/courses/:courseId/deletion-preview`
Returns: `{ enrollments, modules, readingMaterials, assignments, submissions, quizzes, quizAttempts, discussionTopics, discussionPosts, attendanceSessions, fileCount, fileBytes }`. Cheap `COUNT(*)` / `SUM(size)` queries; same numbers reused for the audit row's `child_counts`.

`POST /api/admin/r2-cleanup-jobs/:id/retry`
Admin-only. Re-runs `runR2Cleanup` for the named job. Returns `202` once `waitUntil` is scheduled.

## R2 cleanup worker

Lives in `apps/api/src/jobs/r2Cleanup.ts`. Called via `c.executionCtx.waitUntil(...)`. Marks the job `running`, iterates `bucket.list({ prefix, limit: 1000, cursor })`, batch-deletes each page, then marks the job `done`. On thrown error, marks the job `failed` with the error message and increments `attempts`. Idempotent — already-deleted objects don't reappear in `list()`, so a retry resumes from wherever the previous attempt got to.

There is intentionally no cron. The cleanup is triggered by the deletion event itself; the job table exists as a status tracker so admins can see what's pending and retry failures, not as a queue that something polls.

## UI

`TeacherCourseSettings.tsx` gets a new Danger zone section visually separated by a red border at the bottom of the page. The existing inline Delete button on the same page is removed and consolidated into the Danger zone.

The confirmation modal (`DeleteCourseDialog.tsx`, shared between the teacher and admin entry points) shows the course title + code in the heading, the deletion-preview counts as a bulleted list, a "type the course code to confirm" input, and a red "Delete forever" button that stays disabled until the input matches `course.code` exactly. The dialog handles the `useMutation` to `DELETE /api/courses/:id` and, on success, redirects to the user's course list (teacher) or admin courses list (admin).

`AdminCoursesPage.tsx` gets a row-level kebab menu adding "Delete course…" which opens the same dialog. The same page renders a small "Cleanup pending" or "Cleanup failed" badge next to recently-deleted course entries pulled from `course_deletion_log` joined to `r2_cleanup_jobs`; failed rows expose a "Retry cleanup" button wired to the retry endpoint.

All new strings go through `apps/web/src/locales/en.ts` and `zh-CN.ts` under a `course.dangerZone.*` namespace.

## Testing

API:

- `confirmCode` missing or wrong → 400, course still exists.
- Co-teacher caller → 403.
- Primary teacher → 204, course gone, `course_deletion_log` row inserted with correct counts, `r2_cleanup_jobs` row inserted, every child table queried by `courseId` returns zero rows.
- Admin on someone else's course → 204.
- Non-existent course id → 404.
- Deletion-preview endpoint returns the same counts that subsequently land in the audit row.
- `r2Cleanup`: simulate `bucket.list` throwing → job ends `failed`; retry endpoint re-runs and succeeds.

Web:

- `DeleteCourseDialog`: button disabled until typed code matches; mismatched code keeps it disabled; match enables it; submit sends `{ confirmCode }`.
- Co-teacher visiting course settings sees the Danger zone with a disabled button and the tooltip.

## Risks and trade-offs

- **Co-teacher exclusion** is intentional but means a course where the primary teacher has left the institution can't be deleted by another instructor without an admin assist. Acceptable for v1; revisit if it becomes a friction point.
- **`waitUntil` budget**: a course with tens of thousands of R2 objects could exceed the per-request Worker wall-time budget. The job ends `failed` and an admin can retry; each retry resumes from a clean `list()`. Worst case is a few retry clicks for the largest courses; no data is left inconsistent.
- **No undo**: by design. Type-to-confirm is the only safety net; an accidental deletion is irreversible.
- **No FK from job tables to `courses`**: required so the rows outlive the deletion, but means an unrelated bug that wrote bogus course ids would leave orphan rows. The deletion-log table is admin-readable so orphans would be visible.
