# Auto-mark Absent on Sign-in Cutoff — Design

**Goal:** After a session's sign-in window has closed (i.e.
`now > sessionDate + absentAfterMinutes`), automatically mark every
enrolled student who never signed in as **absent**, without requiring
the teacher to do anything.

## Decided scope

- **Trigger:** Cloudflare Workers cron, every 5 minutes. A `scheduled`
  handler scans for sessions past their absent cutoff and materializes
  the missing records. Lazy backstop runs at read time too so a teacher
  who opens the page right after the cutoff sees the right state
  immediately, even if the cron hasn't fired yet.
- **Eligibility:** session.status = `open`,
  `absent_after_minutes IS NOT NULL`,
  `now() >= session_date + (absent_after_minutes || ' minutes')::interval`,
  and `session.session_date >= now() - interval '14 days'` (cap the
  backfill window so the cron doesn't keep scanning ancient sessions).
- **Per-student rule:** insert a new `attendance_records` row only when
  the student has no record yet for this session. Students who already
  have a record (present / late from self-sign, or manually marked) are
  left untouched, even if status is 'excused' — those records win.
- **Closing semantics:** sessions remain `open` after auto-marking;
  teachers can still flip a row to `excused` after the fact. Auto-close
  stays manual.

## Data model

No schema changes. Reuse `attendance_records` columns.

- `status = 'absent'`
- `notes = 'auto'` (small machine-readable marker; the UI maps this to
  a localized hint)
- `created_at = now()`
- `marked_by_id = NULL` (no actor; cron / system)

The unique index on `(session_id, student_id)` prevents duplicate inserts
under concurrent cron + lazy backstop runs.

## API

### Cron handler

`apps/api/src/services/attendanceAutoAbsent.ts` exports
`runAutoAbsentSweep(db, env)`:

1. `SELECT id, session_date, absent_after_minutes, course_id
   FROM attendance_sessions
   WHERE status='open'
     AND absent_after_minutes IS NOT NULL
     AND session_date >= now() - interval '14 days'
     AND now() >= session_date + (absent_after_minutes || ' minutes')::interval`.
2. For each session row, run a single statement that finds enrolled
   students with no record yet for the session and inserts
   `(session_id, student_id, 'absent', 'auto', now())` for each.
   Done as a CTE: `INSERT INTO attendance_records … SELECT … FROM
   enrollments e WHERE e.course_id = $1 AND e.status='enrolled' AND
   NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.session_id =
   $2 AND ar.student_id = e.student_id) ON CONFLICT
   (session_id, student_id) DO NOTHING RETURNING id`.
3. Emit an audit log per session: `action='attendance.auto_absent',
   target=sessionId, metadata={ inserted: N }`.

Wire into the existing `scheduled` handler in `apps/api/src/index.ts`
by branching on `controller.cron`. Add a second entry to
`wrangler.toml`'s `[triggers]` array: e.g. `*/5 * * * *` for the
sweep, alongside the existing daily retention sweep.

### Lazy backstop

In `GET /api/courses/:cid/attendance/sessions/:sessionId/records`
(teacher view), call `runAutoAbsentForSession(db, sessionId)` before
loading the records. Same CTE as above scoped to one session — idempotent
under the unique index. Out-of-band best-effort: if it errors, log and
continue with stale data rather than 500 the read.

The student-facing `GET /api/me/courses/:courseId/attendance` does NOT
write; reads always reflect the latest persisted state. The cron + the
teacher's read path together cover the typical access pattern.

## UI

- `'auto'` notes string is mapped to a localized "Auto-marked" tag in
  `RosterCard` so the teacher knows that row wasn't a manual edit.
  Visible as a small muted badge next to the Notes input.
- The Pending tally count naturally drops when the auto-records arrive
  via the existing TanStack refetch.
- No new affordances; the teacher can still flip an auto-marked row to
  `excused` and Save — the bulk-mark endpoint upserts.

## Observability

- Cron run logs `attendance.autoAbsent.ok` with `{ sessionsScanned,
  recordsInserted }`.
- Audit rows per affected session give a permanent receipt.

## Out of scope (V2+)

- Email students who were auto-marked absent.
- "Allow grace period override" per course.
- Re-opening a closed session (would need to manually clear auto rows
  first; not worth automating for V1).
- Server-side timezone — sessions already use `timestamptz`; the
  arithmetic above is UTC-correct.
