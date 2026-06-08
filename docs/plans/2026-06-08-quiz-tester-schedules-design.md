# Quiz tester schedules (staggered / waved availability) — design

## Goal

Let a teacher/admin split a quiz's audience into ordered **waves** ("tester
schedules"), each with its own availability window, so each student's quiz
unlocks at *their* wave's time.

## Why

Today a quiz has a single course-wide window (`quizzes.start_time/end_time/
until_date`) checked live at attempt creation — it applies identically to every
enrolled student. Teachers need staggered sittings: limited-seat labs, exam
integrity across rooms, or piloting a quiz with a subset before the rest. There
is no per-student override anywhere in the codebase; this adds one.

## Decided scope

In:
- A quiz can have any number of waves; each may override `start_time`, `end_time`,
  `until_date`, `time_limit_minutes`, `max_attempts` (null = inherit the quiz value).
- **Schedules gate access**: when a quiz has ≥1 wave, only students in a wave (or
  absorbed by the single "remainder" wave) can start an attempt; anyone else is
  blocked. A quiz with **zero** waves behaves exactly as today (full backward compat).
- A **remainder** wave (`is_remainder`, max one per quiz) dynamically covers every
  enrolled student not in an explicit wave — auto-absorbing later enrollments.
- Each student is in at most one explicit wave per quiz; assigning moves them.
- Email + in-app alert when a student's wave opens; the student briefing already
  shows a live per-student countdown.

Out:
- Per-student overrides on anything other than the five window/limit fields.
- Remainder-wave email (those members aren't materialized; in-app briefing covers them).
- Self-service wave selection by students (admin/teacher only).

## Architecture

### Data model (`apps/api/src/db/schema.ts`, migration `drizzle/0033_quiz_tester_schedules.sql`)

- `quiz_schedules` — one row per wave: `quiz_id`→quizzes (cascade), `name`,
  `position`, `is_remainder`, the five nullable override fields, `created_by_id`,
  timestamps. Partial unique `(quiz_id) WHERE is_remainder` (one remainder/quiz).
- `quiz_schedule_members` — `schedule_id`→quiz_schedules (cascade), `quiz_id`
  (denormalized) →quizzes (cascade), `student_id`→users (cascade), `notified_at`,
  timestamps. Unique `(quiz_id, student_id)` (one wave per student per quiz).
- `quiz_attempts.schedule_id` — nullable FK → quiz_schedules **on delete set null**
  (records which wave governed an attempt; null for ungated/historical).
- New `alert_type` enum value `quiz_schedule_open`.

### Resolution (`apps/api/src/services/quizSchedules.ts`)

`resolveQuizScheduleForStudent(db, quiz, studentId)`:
1. No schedules → `{gated:false, window: quiz defaults}` (today's path).
2. Explicit wave membership → that wave; else a remainder wave → it; else
   `{gated:true, blocked:true}`.
3. `mergeWaveWindow(quiz, wave)` = wave field ?? quiz field (pure, unit-tested).

Wired into `POST /quizzes/:quizId/attempts`: block (403 FORBIDDEN) when
gated+unassigned; otherwise the resolved window drives the existing start/close
checks, the `max_attempts` count check, `computeAttemptExpiry` (unchanged min-of),
and `schedule_id` is persisted on the attempt. `GET /quizzes/:quizId` attaches a
`mySchedule` (+`hasSchedules`) field for students so the briefing renders their
times or a "not scheduled" state.

### API (`apps/api/src/routes/quizSchedules.ts`, scopes reuse quizzesRead/Write)

- `GET /quizzes/:quizId/schedules` → waves + members + `remainderPreview` (the
  `NOT EXISTS` unassigned-roster query) — teacher/admin only.
- `POST /quizzes/:quizId/schedules` (rejects a 2nd remainder with 409).
- `PATCH /quizzes/:quizId/schedules/:scheduleId` (resets members' `notified_at`
  when the window changes).
- `DELETE /quizzes/:quizId/schedules/:scheduleId`.
- `PUT /quizzes/:quizId/schedules/:scheduleId/members` — batch set; validates
  enrollment; moves students out of other waves; upsert resets `notified_at`.

### Notifications (`apps/api/src/jobs/quizScheduleOpenSweep.ts`)

A frequent cron (`*/15 * * * *`, added to `wrangler.toml`; `index.ts scheduled()`
now branches on `controller.cron`) finds member rows whose effective wave start has
passed and `notified_at IS NULL`, inserts a `quiz_schedule_open` alert
(`ON CONFLICT DO NOTHING` against the partial-unique open-alert index), sends a
best-effort email, then stamps `notified_at`. Idempotent; one aggregated system
audit row per run. Bounded to opens within the last 7 days.

### UI

- Teacher: a `QuizSchedulesEditor` section in `TeacherQuizEditorPage` — per-wave
  window inputs, time-limit/attempts overrides (placeholder shows the inherited
  value), remainder toggle, a member picker, and a live "N unscheduled → blocked"
  / "absorbed by remainder" hint.
- Student: `StudentQuizRunnerPage` derives an effective window from `mySchedule`,
  feeds it through the existing phase machine / countdown / timeline / `startGate`,
  and adds a `blocked` phase ("You're not scheduled for this quiz"). `studentTasks`
  honours the wave window when present.
- i18n keys under `quizzes.schedules.*` and `alerts.type.quiz_schedule_open` in
  en / zh-CN / fr.

## Testing

- Unit: `mergeWaveWindow`/`windowFromQuiz`; the email renderer; the sweep
  (notify/idempotency, no-op, email-failure still notifies).
- Permissions: all five routes 401 without auth.
- Integration (skipIf no DB): backward-compat, gating blocks unassigned, dynamic
  remainder, per-wave `until_date`→expiry, per-wave `max_attempts` override,
  mutual-exclusivity move, second-remainder 409, remainder preview count,
  student-forbidden management.

## Risks and trade-offs

- **Notification latency** ≤15 min; access is real-time at attempt time and the
  briefing countdown is live, so the email is convenience, not the gate.
- **max_attempts override** is safe — `quiz_attempts(quiz_id, student_id)` is a
  plain index, not unique; the cap is enforced by a `count(*)` check.
- **Editing a wave window** resets `notified_at` (re-arms) but never recomputes an
  in-progress attempt's frozen `expires_at` — no retroactive kill/extend.
- **Remainder members** aren't materialized, so they get the in-app briefing but
  not the wave-open email (documented; materialize-on-notify is a clean follow-up).
- **Alert dedupe**: two open quizzes in one course share the `quiz_schedule_open`
  open-alert slot; mitigated with `ON CONFLICT DO NOTHING` + `quizId` in metadata.
