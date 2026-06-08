# Quiz sets — implementation plan

Goal: ship quiz sets — bundles of quizzes that roll up to one score (per a
scoring rule) inside a weighted category (see the paired design doc). A direct
mirror of assignment sets. Built as eleven commits; each task runs scope tests +
`pnpm typecheck` before a single-line scoped commit.

Conventions: idempotent hand-authored migration (`IF NOT EXISTS` / `DO $$`,
`--> statement-breakpoint`, neon-http has no `db.transaction`); route stack
`requireAuth → requireScopeGroup → requireTokenCourseAccess →
canAccessCourse/canWriteCourse`; Zod validators in `@coursewise/shared`; tri-file
i18n (`en` + `zh-CN` + `fr`); `*.permissions.test.ts` (no DB) +
`*.integration.test.ts` (`skipIf(!DATABASE_URL)`); never `--no-verify`.

## Task 1 — shared validators + types
`packages/shared/src/validators.ts`: `QUIZ_SET_RULES = ['average','highest']`,
`createQuizSetSchema`, `updateQuizSetSchema` (name/groupId/scoringRule/position),
and add `setId: z.string().uuid().nullable().optional()` to `updateQuizSchema`.
`types.ts`: `QuizSetRule`, `QuizSet` (mirror `AssignmentSet`), add `setId` to
`QuizSummary`. Mirror `validators.ts:1166–1182` / `types.ts:805–819`.
Commit: `shared: quiz-set validators + types`.

## Task 2 — DB schema
`apps/api/src/db/schema.ts`: `quizSetRuleEnum = pgEnum('quiz_set_rule', […])`,
`quizSets` table (course_idx + `(course_id, lower(name))` unique), `QuizSetRow`
export, and `quizzes.setId` FK (`onDelete: 'set null'`). Mirror schema.ts:556–584.
Commit: `db: quiz_sets table + quizzes.set_id`.

## Task 3 — migration
`npm run db:generate -w apps/api` to scaffold `0034_*.sql` + `meta/_journal.json`,
then harden to idempotent: `CREATE TYPE quiz_set_rule` (guarded `DO $$ … EXCEPTION
WHEN duplicate_object`), `CREATE TABLE IF NOT EXISTS quiz_sets` + indexes,
`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS set_id` + guarded `ADD CONSTRAINT`
FK. No backfill. Mirror `0030_assignment_sets.sql` + `0033`'s guard style.
Commit: `db: migration 0034 quiz sets`.

## Task 4 — finalGrade wiring + unit tests
`apps/api/src/services/finalGrade.ts`: add `CourseQuizSetDef` + `quizSets` to
`CourseGradingContext`; in `loadCourseGradingContext` load `quiz_sets` and route
`setId` quizzes to their set (excluded from direct category items, set wins); in
`buildAlgorithmInput` append each quiz set as one `'set'` item (members
`itemType:'quiz'`, best attempt %, `rollUpSetScore(rule, …)`). Extend
`finalGrade.test.ts`: average rollup, highest rollup, all-unscored drops out,
set-precedence over group.
Commit: `api: roll quiz sets into the final grade`.

## Task 5 — quiz-sets routes
`apps/api/src/routes/quizSets.ts` (GET list with `memberCount`, POST, PATCH,
DELETE with `orphanedItemCount`; `markFinalGradesOutdated` + `quiz-set.*` audit on
each mutation). Clone `assignmentSets.ts`. Mount in `index.ts`; register in
`lib/openapi.ts`.
Commit: `api: quiz-set CRUD routes`.

## Task 6 — wire quizzes.ts
`apps/api/src/routes/quizzes.ts` PATCH handler: map `setId` from the validated
body into the quiz update (mirror the existing `groupId` mapping).
Commit: `api: accept set_id on quiz update`.

## Task 7 — teacher UI
`apps/web/src/pages/teacher/TeacherQuizzesPage.tsx`: "Manage quiz sets" dialog
(create/rename/category/rule/delete) cloning the assignment manage-sets dialog.
`TeacherQuizEditorPage.tsx`: a "Set" `<select>` (from `useQuizSets`) on the
settings card next to the `groupId` select + category hint. `lib/queries.ts`:
`useQuizSets`/`useCreateQuizSet`/`useUpdateQuizSet`/`useDeleteQuizSet`
(invalidate `['quiz-sets',courseId]`, `['final-grades',courseId]`,
`['my-final-grade']`).
Commit: `web: manage quiz sets + per-quiz set selector`.

## Task 8 — gradebook set members
`apps/web/src/pages/teacher/TeacherGradebookStudentPage.tsx`: render a `'set'`
row's members of `itemType:'quiz'` as read-only QuizRows (best-attempt score,
link to `/quizzes/:id/attempts`) instead of assignment rows.
Commit: `web: render quiz-set members in the gradebook`.

## Task 9 — i18n
`apps/web/src/locales/{en,zh-CN,fr}.ts`: `quizzes.sets.*` (manage title/intro,
add/rename/delete, ruleAverage/ruleHighest, categoryLabel, suppliesCategoryHint,
deleteConfirm, orphanToast, saved). Identical keys in all three.
Commit: `web: i18n for quiz sets`.

## Task 10 — tests
`apps/api/src/routes/quizSets.permissions.test.ts` (401×4, 403 write/read) +
`quizSets.integration.test.ts` (CRUD, memberCount, name-uniqueness 409,
delete-orphans, setId excludes from category). Web: a `TeacherQuizzesPage`
manage-sets dialog test if the page already has a `*.test.tsx` harness.
Commit: `test: quiz sets (permissions, CRUD, rollup, orphan)`.

## Task 11 — wrap-up
`pnpm typecheck && lint && test && build` (all green; integration tests skip
without `DATABASE_URL`). Authored these docs.

## Test plan / notes for executor
- CI (`.github/workflows/deploy.yml`) runs typecheck → lint → test → build, then
  `db:migrate` against the deploy DB; migration 0034 applies there.
- Local integration run: set `DATABASE_URL`, `pnpm db:migrate`, `pnpm db:seed`
  (provides teacher@/student1-3@), then `pnpm --filter @coursewise/api test`.
- `set_id` takes precedence over `group_id` for grading — verify a quiz with both
  is counted only via its set (finalGrade unit + integration both assert this).
- Reuse `rollUpSetScore` and `computeFinalScore` unchanged; only the DB→input
  adapters in `finalGrade.ts` change. Roll up on **percentages** (per-quiz max
  varies), never raw points.
- Manual smoke: "Weekly" set (rule `highest`) in the Quizzes category with two
  quizzes; student scores 60% / 90% → category shows one row at 90% with two
  indented members; switch to `average` → 75%; delete the set → both quizzes
  reappear as separate category rows.
