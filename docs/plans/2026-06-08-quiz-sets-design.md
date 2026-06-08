# Quiz sets — design

## Goal

Let a teacher bundle several quizzes into a **quiz set** that rolls its members
up to **one score** (per a scoring rule — `average` or best-of `highest`) which
then counts as a single item inside a weighted assignment-group category, exactly
the way **assignment sets** already work for assignments. Example: ten weekly
quizzes collapse to one "Weekly quizzes" row whose score is the average (or the
best-of) of the ten, contributing once to the course's final grade.

## Why

Today every posted quiz with a `group_id` is its own equal item inside its
category: `category.raw = mean(item %)` (`finalGrade.ts:113`). Ten weekly quizzes
in the "Quizzes" category each weigh 1/10 of that category, and a teacher who
wants "best 1 of 2 retakes counts" or "the weekly-quiz average is one line in the
grade" has no way to express it. Assignments already solved this with
`assignment_sets` (migration 0030): a bundle of assignments rolls up via a
scoring rule into a single category item. Quizzes have the matching item type
(`GroupScoreItem.itemType` already includes `'set'`) but no set construct of
their own. Quiz sets close that gap with a direct mirror of the assignment-set
machinery.

## Decided scope

Confirmed with the requester:

- **Contribution model — roll into a category.** A quiz set produces one rolled
  score that sits inside an `assignment_groups` category; the group's weight
  carries it to the final grade. No new weighting axis. (Mirrors assignment sets
  — *not* a standalone weighted bucket.)
- **Structure — a separate `quiz_sets` table.** A parallel table + route + UI,
  cloning `assignment_sets`. A quiz set bundles **quizzes only** (no mixing with
  assignments).
- **Scoring rules — `average` and `highest` only.** Identical value domain to
  `ASSIGNMENT_SET_RULES`; modelled as its own `quiz_set_rule` enum so the two
  features stay decoupled and can diverge later.

In:

- New `quiz_sets` table (per-course; `name`, `scoringRule`, nullable `groupId`,
  `position`) + `quizzes.set_id` FK.
- `finalGrade.ts` rolls quiz-set members up to one `'set'` item in the set's
  category, mirroring the assignment-set path; `set_id` takes precedence over a
  direct `group_id` for grading.
- `quizSets.ts` CRUD route; `setId` added to the quiz PATCH.
- Teacher UI: a "Manage quiz sets" dialog on the quizzes page + a "Set" selector
  on the quiz editor; gradebook reuses the existing rolled-`'set'` row.
- Migration 0034; tri-file i18n; permissions + integration + unit tests.

Out:

- Drop-lowest-N (or any rule beyond `average`/`highest`).
- Mixing quizzes and assignments in one set.
- Per-set weight (weight lives on the category, never the set or item).
- Reordering endpoint (sets have none today — `position` is set on create/PATCH).
- Per-set letter thresholds, points-based rollup, backfill of existing data.

## Architecture

### Data model — `apps/api/src/db/schema.ts` (+ migration 0034)

Mirror `assignmentSetRuleEnum` / `assignmentSets` (schema.ts:556–584):

```ts
export const quizSetRuleEnum = pgEnum('quiz_set_rule', ['average', 'highest']);

export const quizSets = pgTable(
  'quiz_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    scoringRule: quizSetRuleEnum('scoring_rule').notNull().default('average'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('quiz_sets_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('quiz_sets_course_name_idx').on(t.courseId, sql`lower(${t.name})`),
  }),
);
export type QuizSetRow = typeof quizSets.$inferSelect;
```

Add to `quizzes` (schema.ts:802): `setId: uuid('set_id').references(() =>
quizSets.id, { onDelete: 'set null' })`, placed next to `groupId` and mutually
exclusive with it *for grading* (set wins). `ON DELETE SET NULL` means deleting a
set orphans its quizzes back to `set_id = NULL` rather than cascading; the route
reports `orphanedItemCount`.

A quiz set is the quiz analog of an assignment set; it is unrelated to
`quizSchedules` (waves of testers) and to `groupSets` (student teams) — same
naming caution the schema already documents at line 560.

### Final-grade math — `apps/api/src/services/finalGrade.ts`

The pure rollup (`rollUpSetScore`, finalGrade.ts:98) and `computeFinalScore` are
**reused unchanged** — they already roll a `'set'` item up on member percentages
and treat a null-rolled set as dropping out of its category. Only the DB→input
adapters change, mirroring the assignment-set path:

1. `CourseGradingContext` gains `quizSets: CourseQuizSetDef[]` (`id`, `rule`,
   `groupId`, `memberQuizIds`).
2. `loadCourseGradingContext`: load `quiz_sets` for the course. When loading
   quizzes, a quiz with a `setId` is routed to its set's `memberQuizIds` (and its
   `quizMeta` recorded) and **excluded from the category's direct quiz items** —
   exactly the `set_id`-takes-precedence branch assignments use at
   finalGrade.ts:278–288. A quiz with only `groupId` stays a direct category
   item (today's behavior). The posted-gate (`isItemPosted`) still applies.
3. `buildAlgorithmInput`: for each quiz set with a `groupId`, build `members`
   from `memberQuizIds` (look up `quizMeta` + the student's **best attempt** via
   `studentScores.quiz`, as percentages), call `rollUpSetScore(set.rule,
   percents)`, and append one `{ type: 'set', members }` item to the target
   category — the quiz twin of the assignment-set loop at finalGrade.ts:560–587.
   Set members carry `itemType: 'quiz'`.

`buildGradebookStudentDetail` needs no rollup change: it renders categories from
the persisted `finalGrade.groups[]` (which now include quiz-`'set'` rows after a
recalc) and still lists every posted quiz in its flat `quizzes.items` pool, just
as set-member assignments still appear in the flat assignments pool.

### API

New `apps/api/src/routes/quizSets.ts`, a direct clone of `assignmentSets.ts`,
route stack `requireAuth → requireScopeGroup → requireTokenCourseAccess →
canAccessCourse/canWriteCourse`:

- `GET /api/courses/:courseId/quiz-sets` — `coursesRead`; lists sets ordered by
  `position` with `memberCount = count(quizzes WHERE set_id = s.id)`.
- `POST /api/courses/:courseId/quiz-sets` — `coursesWrite`; body
  `{ name, groupId?, scoringRule?, position? }`; `position` defaults to `max+1`;
  unique `(course_id, lower(name))` → 409.
- `PATCH /api/courses/:courseId/quiz-sets/:setId` — `coursesWrite`;
  `{ name?, groupId?, scoringRule?, position? }`.
- `DELETE /api/courses/:courseId/quiz-sets/:setId` — `coursesWrite`; FK orphans
  members; returns `{ id, orphanedItemCount }`.

Every mutation calls `markFinalGradesOutdated(courseId)` and writes a
`quiz-set.{create,update,delete}` audit row. Mount in `index.ts`; register in
`lib/openapi.ts`. The quiz PATCH (`updateQuizSchema` + `routes/quizzes.ts`) gains
`setId: z.string().uuid().nullable().optional()` and maps it into the update —
mirroring how `groupId` is already PATCH-settable on a quiz.

### UI — `apps/web`

Mirror the assignment-set UI (which lives on `TeacherAssignmentsPage.tsx`):

- **Manage quiz sets** dialog on `TeacherQuizzesPage.tsx`: create / rename / pick
  category (`groupId`) / pick `scoringRule` (`average`|`highest`) / delete,
  cloning the assignment "Manage sets" dialog.
- **Set selector** on `TeacherQuizEditorPage.tsx` settings card, next to the
  existing `groupId` `<select>` (which already reuses `useAssignmentGroups`):
  a "Set" `<select>` from `useQuizSets(courseId)` with an "Unassigned" option,
  plus a hint that a set supplies the grading category (so its `group_id`, not
  the quiz's, governs grading).
- **Gradebook**: `TeacherGradebookStudentPage.tsx` already renders rolled
  `'set'` rows with indented members. Quiz-set members arrive with
  `itemType: 'quiz'`, so the member row must render like a `QuizRow` (read-only
  best-attempt score, link to `/quizzes/:id/attempts`) instead of an assignment
  row — the one small rendering tweak.
- **Hooks** in `lib/queries.ts`: `useQuizSets`, `useCreateQuizSet`,
  `useUpdateQuizSet`, `useDeleteQuizSet`, mirroring `useAssignmentSets*` and
  invalidating `['quiz-sets', courseId]`, `['final-grades', courseId]`,
  `['my-final-grade']`.
- **i18n**: a `quizzes.sets.*` block (manage dialog, rule labels, set-supplies-
  category hint, delete-confirm, orphan toast) added identically to
  `locales/{en,zh-CN,fr}.ts`.

### Snapshot / outdated semantics

Set mutations flag the course's `final_grades.isOutdated = true`; the teacher's
next Recalculate folds quiz sets in. `gradingPolicySnapshot` is unchanged — it
snapshots categories (groups) + weights, and a quiz set is an item *inside* a
category, exactly like an assignment set (which is also absent from the snapshot).

## Testing

- `quizSets.permissions.test.ts` (no DB) — 401 on all four routes unauthenticated;
  403 writes for a non-teacher; 403 reads for a non-member. Mirrors
  `assignmentGroups.permissions.test.ts`.
- `quizSets.integration.test.ts` (`skipIf(!DATABASE_URL)`) — create/list with
  `memberCount`; PATCH name/category/rule/position; `(course_id, lower(name))`
  uniqueness → 409; delete leaves quizzes with `set_id = NULL` and reports
  `orphanedItemCount`; assigning a quiz a `setId` excludes it from its category's
  direct items.
- `finalGrade.test.ts` — extend with: a quiz set of three quizzes rolling up via
  `average` and via `highest`; a quiz set whose members are all unscored drops
  out of its category; a quiz with both `setId` and `groupId` is counted via the
  set only (precedence).
- `finalGrade.integration.test.ts` (if present) — seed a course with one quiz set
  in a weighted category and assert the hand-calculated final score.
- Manual smoke: create a "Weekly" quiz set (rule `highest`) in the Quizzes
  category, attach two quizzes, give a student 60% and 90%, recalc → the category
  shows one "Weekly" row at 90% with two indented members; switch the rule to
  `average` → the row reads 75%; delete the set → both quizzes return to the
  category as separate rows.

## Risks and trade-offs

- **Parallel enum duplication.** `quiz_set_rule` duplicates `assignment_set_rule`'s
  values. Chosen deliberately for decoupling (per the "separate" decision);
  reusing `assignment_set_rule` was the alternative and would save one
  `CREATE TYPE` at the cost of coupling the two features.
- **`set_id` + `group_id` both populated.** A quiz can carry both columns; grading
  prefers the set (matches assignments). The UI must make this obvious (the set
  supplies the category) to avoid teacher confusion.
- **Gradebook member-row type.** The existing `'set'` member renderer assumes
  assignment members; quiz members need the read-only QuizRow treatment. Small,
  but easy to miss — covered by a component check.
- **No backfill needed.** Net-new; all quizzes start `set_id = NULL`, so no
  existing grade shifts and `is_outdated` is only flipped when a teacher actually
  creates/edits a set.
