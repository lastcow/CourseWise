# Quiz tester schedules — implementation plan

Goal: ship staggered/waved quiz availability (see the paired design doc). Built as
twelve commits; each task ran scope tests + `pnpm typecheck` before committing.

Conventions: idempotent hand-authored migration (`IF NOT EXISTS` / `DO $$`);
route stack `requireAuth → requireScopeGroup → canWriteCourse`; Zod validators in
`@coursewise/shared`; tri-file i18n; `*.permissions.test.ts` (no DB) +
`*.integration.test.ts` (`skipIf(!DATABASE_URL)`).

## Task 1 — shared validators + types
`packages/shared/src/validators.ts`: `createQuizScheduleSchema`,
`updateQuizScheduleSchema`, `setScheduleMembersSchema` (reuse `isoDateString`,
`quizSchedulingOrderOk`). `types.ts`: `QuizScheduleSummary`,
`QuizScheduleWithMembers`, `QuizScheduleListResponse`, `QuizStudentSchedule`;
extend `QuizSummary` with `mySchedule`/`hasSchedules`.
Commit: `shared: quiz tester-schedule validators + types`.

## Task 2 — DB schema
`apps/api/src/db/schema.ts`: `quizSchedules`, `quizScheduleMembers`,
`quizAttempts.scheduleId`, `alertTypeEnum += 'quiz_schedule_open'`. Mirror the new
alert value into `packages/shared/src/constants.ts ALERT_TYPES`.
Commit: `db: quiz schedules + members + attempt scheduleId`.

## Task 3 — migration
`apps/api/drizzle/0033_quiz_tester_schedules.sql` (+ `meta/_journal.json` entry):
enum value, both tables, indexes, partial-unique remainder, unique member, attempt
column + FK. Idempotent.
Commit: `db: migration 0033 quiz tester schedules`.

## Task 4 — resolver service
`apps/api/src/services/quizSchedules.ts` (`resolveQuizScheduleForStudent`,
pure `mergeWaveWindow`/`windowFromQuiz`) + `quizSchedules.test.ts`.
Commit: `api: quiz schedule effective-window resolver`.

## Task 5 — schedule routes
`apps/api/src/routes/quizSchedules.ts` (list+preview, create, patch, delete, PUT
members); mount in `index.ts`; register in `lib/openapi.ts`.
Commit: `api: quiz tester-schedule CRUD + member routes`.

## Task 6 — wire quizzes.ts
`POST /quizzes/:quizId/attempts`: resolve window, block unassigned (403), apply
window to start/close/`max_attempts`/expiry, persist `scheduleId`, audit.
`GET /quizzes/:quizId`: attach `mySchedule`/`hasSchedules` for students.
Commit: `api: gate quiz attempts by tester schedule + surface mySchedule`.

## Task 7 — notification cron
`apps/api/src/jobs/quizScheduleOpenSweep.ts` +
`services/quizScheduleOpenEmail.ts` (+ tests); branch `index.ts scheduled()` on
`controller.cron`; add `*/15 * * * *` to `wrangler.toml`.
Commit: `api: wave-open notification sweep (email + alert)`.

## Task 8 — teacher UI
`apps/web/src/components/teacher/QuizSchedulesEditor.tsx`; mount in
`TeacherQuizEditorPage.tsx`; 5 hooks in `lib/queries.ts`; add
`quiz_schedule_open` to the `Record<AlertType>` maps in `TeacherAlertsPage.tsx`.
Commit: `web: teacher multi-wave schedule editor`.

## Task 9 — student UI
`StudentQuizRunnerPage.tsx`: effective-window override, `blocked` phase,
`startGate`/`notYetAttemptable`. `components/student/studentTasks.ts`: honour
`mySchedule`.
Commit: `web: student briefing honors per-student wave window`.

## Task 10 — i18n
`apps/web/src/locales/{en,zh-CN,fr}.ts`: `quizzes.schedules.*` +
`alerts.type.quiz_schedule_open`.
Commit: `web: i18n for quiz tester schedules`.

## Task 11 — tests
`apps/api/src/routes/quizSchedules.permissions.test.ts` (401×5) +
`quizSchedules.integration.test.ts` (gating, remainder, window override on
expiry, max-attempts override, mutual-exclusivity move, second-remainder 409,
preview count, student-forbidden).
Commit: `test: quiz tester schedules (gating, remainder, overrides, notify)`.

## Task 12 — wrap-up
`pnpm typecheck && lint && test && build` (all green; integration tests skip
without `DATABASE_URL`). Authored these docs.

## Test plan / notes for executor
- CI (`.github/workflows/deploy.yml`) runs typecheck → lint → test → build, then
  `db:migrate` against the deploy DB; migration 0033 applies there.
- To run the integration suite locally: set `DATABASE_URL`, `pnpm db:migrate`,
  `pnpm db:seed` (provides teacher@/student1-3@), then
  `pnpm --filter @coursewise/api test`.
- Manual smoke: create 2 waves + a remainder, assign one student to wave A; an
  unassigned student is blocked with no remainder, then absorbed once a remainder
  exists; the briefing countdown shows the per-student open time; the wave-open
  email/alert fires on the next 15-min tick and does not duplicate.
