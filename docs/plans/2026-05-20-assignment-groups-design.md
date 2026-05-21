# Canvas-Style Assignment Groups — Design

## Goal

Replace today's five fixed grading categories (`attendance`, `assignments`, `quizzes`, `discussion`, `finalProject`) with user-defined per-course **assignment groups** in the Canvas tradition. A teacher can create named groups (`Homework`, `Discussion`, `Project`, `Exam`, or anything else) with arbitrary weights, and place any assignment, quiz, or discussion topic into any group. Attendance stays as a course-level weight outside the groups.

## Why

Today the schema hardcodes four assignment-shaped weights (`weightAssignments`, `weightQuizzes`, `weightDiscussion`, `weightFinalProject`) into the `gradingPolicies` table and into the `GRADING_POLICY_CATEGORIES` constant. The "Final Project" bucket is populated by title-keyword matching (`isFinalProjectTitle()` in `finalGrade.ts`). A teacher who wants to run a course with, say, two midterm exams, three projects, and weekly quizzes has nowhere to put those buckets. Canvas-style assignment groups let teachers describe their actual course structure instead of forcing it into a five-category mold.

## Scope

In scope:

- New `assignment_groups` table (per-course, name + weight + position).
- New nullable `group_id` FK on `assignments`, `quizzes`, `discussion_topics`.
- `gradingPolicies` table loses four weight columns, keeps `weightAttendance` and `lettersJson`.
- `finalGrade.ts` rewrites to compute per-group averages, weight-sum them, blend with attendance.
- `TeacherGradingPolicyPage` becomes a sortable groups editor.
- `TeacherGradebookStudentPage` and the student gradebook view render group-driven cards instead of the hardcoded five.
- One migration that creates the table, backfills four default groups for every existing course, assigns existing items to those groups, then drops the old columns.

Out of scope for v1:

- Drop-lowest-N per group (Canvas feature).
- Per-item rules ("never drop quiz X", "count this assignment twice").
- Per-group letter-grade thresholds (letter grades stay course-level).
- An "unweighted" mode (Canvas toggle that ignores group weights and averages all items).

## Architecture

### Data model

A course has zero or more assignment groups. Each group has a name (unique per course, case-insensitive), a weight in 0–100, and a position for sort order. Every gradable item (`assignments`, `quizzes`, `discussion_topics`) carries a nullable `group_id`. Nullable because deleting a group sets its items' `group_id` back to NULL (`ON DELETE SET NULL`); the gradebook surfaces unassigned items to teachers so they can pick a new home.

`gradingPolicies` keeps only `weightAttendance`, `lettersJson`, `version`, and `updatedById`. The per-group weights live on the `assignment_groups` rows themselves — there's no aggregate "weightGroups" because the sum of group weights is the implicit complement.

### Final-grade math

For each course:

1. Load groups ordered by position. Load every gradable item joined to its group.
2. For each group, average the items' percentage scores (`score / maxScore * 100`). A group with zero scored items contributes `null`.
3. `groupsScore = Σ(group.raw × group.weight) / Σ(group.weight where raw ≠ null)`. If every group is null, `groupsScore` is null.
4. Compute `attendanceRate` from `attendance_sessions` (unchanged from today).
5. `finalScore = (attendanceRate × attendanceWeight + groupsScore × (100 − attendanceWeight)) / 100`. Missing pieces redistribute the same way today's algorithm handles missing categories.
6. Letter grade comes from `lettersJson` thresholds (unchanged).

The sum-of-group-weights = 100 constraint is enforced at the "finalize grades" endpoint, not on every group PATCH. Teachers can edit weights freely; finalize is the gate.

### Snapshot semantics

`final_grades.grading_policy_snapshot` now captures the full group list (id, name, weight) at finalization time. Subsequent group renames or weight changes don't retroactively shift past finalized grades — the same audit guarantee today's snapshot provides, expanded to cover groups.

## API

New file `apps/api/src/routes/assignmentGroups.ts`:

- `GET /api/courses/:courseId/assignment-groups` — admin or any teacher of the course. Returns groups ordered by `position`, each with an `itemCount` aggregate (count of assignments + quizzes + discussion_topics pointing at it).
- `POST /api/courses/:courseId/assignment-groups` — `canWriteCourse`. Body `{ name, weight, position? }`. Server-side uniqueness on `(courseId, lower(name))`.
- `PATCH /api/courses/:courseId/assignment-groups/:groupId` — same auth. Body `{ name?, weight?, position? }`.
- `DELETE /api/courses/:courseId/assignment-groups/:groupId` — same auth. FK does the orphaning. Response carries `{ orphanedItemCount }` so the UI shows "Reassign N items".
- `POST /api/courses/:courseId/assignment-groups/reorder` — bulk reorder via one CTE that updates every group's `position` from a passed `orderedIds` array.

Existing PATCH endpoints on assignments, quizzes, and discussion topics gain an optional `groupId: z.string().uuid().nullable().optional()` field.

The "finalize grades" route adds a sum-to-100 precondition: if `Σ groupWeights ≠ 100`, return 400 with the current sum so the UI can render a meaningful error.

`final_grades` response shape changes: `categoryScores` jsonb keeps its column name but its content shifts to a `groups[]` array. Front-end consumers must adapt; covered in the UI section.

## UI

`TeacherGradingPolicyPage` is rewritten as a three-section form:

1. Attendance weight — a single 0–100 number input that maps to `gradingPolicies.weightAttendance`.
2. Assignment groups — a sortable list with drag-handle, name input, weight input, "items: N" pill, and delete button. Edits debounce-save individually; reordering posts to the bulk endpoint.
3. A validation banner that turns amber when `sum(group weights) ≠ 100`. Editing is still allowed; the finalize endpoint is the actual gate.

Item edit pages (`TeacherAssignmentEdit`, `TeacherQuizEdit`, `TeacherDiscussionEdit`) each gain a "Group" select populated from `useAssignmentGroups(courseId)`. An "Unassigned" option is available; unassigned items appear in the gradebook only to teachers, with a "Move to…" picker inline.

`TeacherGradebookStudentPage` rewires from the hardcoded five categories to render the per-course `groups[]` from the new final-grade response. Layout stays the same — collapsible cards, inline-editable item scores — only the cards become user-defined groups. Attendance gets its own card at the top, separate from the groups list. An "Unassigned items" card appears only when there's at least one item with `group_id = null`.

The student-facing gradebook (if any) follows the same layout, read-only, with unassigned items hidden from students.

Five new TanStack Query hooks land in `apps/web/src/lib/queries.ts`: `useAssignmentGroups`, `useCreateAssignmentGroup`, `useUpdateAssignmentGroup`, `useDeleteAssignmentGroup`, `useReorderAssignmentGroups`. All four mutations invalidate `['assignment-groups', courseId]` and `['final-grade', courseId]`.

Full i18n parity in `en.ts` and `zh-CN.ts` for the new `teacher.gradingPolicy.groups.*` and `gradebook.unassigned.*` namespaces.

## Migration

One hand-authored migration `apps/api/drizzle/0015_assignment_groups.sql` (matches the `0014_course_deletion.sql` style — `DO $$ BEGIN … EXCEPTION` wrappers, `CREATE TABLE IF NOT EXISTS`, `--> statement-breakpoint`). Sequence:

1. `CREATE TABLE assignment_groups` + indexes + the `(courseId, lower(name))` unique index.
2. `ALTER TABLE assignments ADD COLUMN group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL;` and the same for `quizzes`, `discussion_topics`.
3. Data backfill — for every existing course, INSERT four default groups (`Assignments`, `Quizzes`, `Discussion`, `Final Project`) with weights pulled from the existing `grading_policies` row and positions 0–3. Then UPDATE every existing item's `group_id` to point at the right group, using the `isFinalProjectTitle` keyword pattern (`ILIKE ANY ('%final project%', '%final_project%', '%finalproject%', '%期末%', '%结业%')`) for the Final Project assignment match.
4. `ALTER TABLE grading_policies DROP COLUMN weight_assignments` (and Quizzes, Discussion, FinalProject). Done last so the backfill can read those columns.
5. `UPDATE final_grades SET is_outdated = true` so teachers know to re-finalize against the new model.

After this migration the codebase deletes `isFinalProjectTitle`, deletes the four constants from `GRADING_POLICY_CATEGORIES`, and shrinks `DEFAULT_GRADING_POLICY` to `{ attendance: 10 }`.

No feature flag — this is a schema change, not a runtime fork.

## Testing

API unit (no DB):

- `assignmentGroups.permissions.test.ts` — 401 on every route without auth; 403 for non-teacher writes; 403 for non-enrolled-non-teacher reads.
- `finalGrade.test.ts` rewrites around the new algorithm with at least: one fully-scored group, two groups with mixed completeness, attendance-only, all-null, sum-of-weights ≠ 100 (still computes; finalize is the gate).

API integration (skipIf no DB):

- `assignmentGroups.integration.test.ts` — CRUD, reorder, delete-leaves-orphans, uniqueness on `(courseId, lower(name))`.
- `finalGrade.integration.test.ts` — seed a course with three groups + attendance, assert hand-calculated final scores.
- One migration test — snapshot an old `grading_policies` row, run the migration, assert four groups exist per course with the right weights, every item has `group_id` populated.

Web component:

- `TeacherGradingPolicyPage.test.tsx` — add group appends row; weight ≠ 100 shows banner; delete with items shows reassign prompt.
- `TeacherGradebookStudentPage.test.tsx` — given mock final-grade data with three groups, renders three cards plus attendance, plus an unassigned card when a mock item has `group_id = null`.

Manual smoke before merge:

1. Pre-migration grades match post-migration grades within rounding tolerance for an existing course.
2. Teacher adds a new group, assigns existing items, refreshes the gradebook — items moved.
3. Teacher deletes a group with items → "Unassigned items" card appears.
4. Teacher tries to finalize with weights summing ≠ 100 → 400 with the current sum.

## Risks and trade-offs

- **Migration over many rows** — the backfill runs `UPDATE` over every assignment / quiz / discussion. Sub-second on the current instance; if the product ever scales to hundreds of thousands of items per migration, revisit.
- **Outdated finalized grades** — flipping `is_outdated = true` is the right default. Teachers see a re-finalize prompt; previously-released grades stay visible to students.
- **Keyword-detected "Final Project" goes away** — `isFinalProjectTitle` is used once during the migration and then deleted. Going forward, group assignment is explicit. Existing items that previously fell into the keyword-detected bucket land in the right group during backfill.
- **No drop-lowest in v1** — teachers used to today's per-category redistribution may notice subtle grade shifts. The same redistribution still happens, but per-group instead of per-category. We'll add drop-lowest in a follow-up if teachers ask.
- **`gradingPolicies` shrinking from five weight columns to one is a breaking change** for any external integration that reads it. There are no such integrations today.
