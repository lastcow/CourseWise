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
Hand-author `apps/api/drizzle/0034_quiz_sets.sql` mirroring
`0030_assignment_sets.sql` (the repo hand-authors idempotent migrations and keeps
only `0000_snapshot.json` — drizzle-kit generate is not used post-0000): guarded
`CREATE TYPE quiz_set_rule` (`DO $$ … EXCEPTION WHEN duplicate_object`),
`CREATE TABLE IF NOT EXISTS quiz_sets` + course/group FKs + course-idx +
`(course_id, lower(name))` unique idx, `ALTER TABLE quizzes ADD COLUMN IF NOT
EXISTS set_id` + guarded FK. Hand-add the `idx:34` entry to `meta/_journal.json`.
No backfill.
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
each mutation). Clone `assignmentSets.ts`. Mount in `index.ts`. Not registered in
`lib/openapi.ts` — assignment sets/groups aren't either (the openapi test only
checks the curated `ROUTES` list resolves, not full coverage), so quiz sets match
that precedent.
Commit: `api: quiz-set CRUD routes`.

## Task 6 — wire quizzes.ts
`apps/api/src/routes/quizzes.ts` PATCH handler: map `setId` from the validated
body into the quiz update (mirror the existing `groupId` mapping).
Commit: `api: accept set_id on quiz update`.

## Task 7 — teacher UI
`apps/web/src/pages/teacher/TeacherQuizzesPage.tsx`: multi-select checkboxes +
"Set" column (removable badge) + a "Group into set" dialog (new/existing mode)
that PATCHes each selected quiz's `setId`, plus a "Manage quiz sets" dialog
(rename/category/rule/delete) — cloning the assignment list page.
`TeacherQuizEditorPage.tsx`: no set selector; disable the category select + show
an "in a set" note when the quiz has a `setId` (mirrors `TeacherAssignmentFormPage`).
`lib/queries.ts`: `useQuizSets`/`useCreateQuizSet`/`useUpdateQuizSet`/
`useDeleteQuizSet` (invalidate `['quiz-sets',courseId]`, `['final-grades',courseId]`,
`['my-final-grade']`); `useUpdateQuiz` also invalidates those.
Commit: `web: manage quiz sets + multi-select group-into-set`.

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
