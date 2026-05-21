# Canvas-Style Assignment Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the five hardcoded grading categories with user-defined per-course assignment groups per `docs/plans/2026-05-20-assignment-groups-design.md`. After this lands, every course has a list of named groups (name + weight + position), every assignment/quiz/discussion belongs to one group, and the final-grade math blends attendance with the weighted average across groups.

**Architecture:** New `assignment_groups` table with FKs from `assignments`, `quizzes`, `discussion_topics`. `gradingPolicies` table loses four weight columns, keeps `weightAttendance` and `lettersJson`. `finalGrade.ts` rewrites to compute per-group averages and weight-sum them. One hand-authored migration creates the table, backfills four default groups per existing course, assigns existing items to those groups, then drops the old columns. `TeacherGradingPolicyPage` becomes a sortable groups editor; the student and teacher gradebook pages rewire to render the per-course groups.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres / Neon HTTP), Cloudflare Workers, Vitest, React, TanStack Query, react-i18next, Tailwind.

---

## Conventions

- Run commands from the worktree root: `/Users/zhijiangchen/CourseWise/.worktrees/assignment-groups`.
- After each task: scope-tests, then `pnpm typecheck`, then commit. Single-line commit messages.
- The neon-http driver does NOT support `db.transaction(...)`. Use single-statement CTEs.
- All new strings hard-code English first; Task 14 i18ns them.
- Never `--no-verify`. Never amend pushed commits.

---

## Task 1: Shared constants + types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/validators.ts`

**Step 1: Constants.** In `constants.ts`, replace `DEFAULT_GRADING_POLICY` (line ~309) and delete `GRADING_POLICY_CATEGORIES` + `GradingPolicyCategory` (lines ~317-324). New:

```ts
export const DEFAULT_GRADING_POLICY = {
  attendance: 10,
} as const;

export const DEFAULT_ASSIGNMENT_GROUPS = [
  { name: 'Assignments',   weight: 35, position: 0 },
  { name: 'Quizzes',       weight: 30, position: 1 },
  { name: 'Discussion',    weight: 10, position: 2 },
  { name: 'Final Project', weight: 15, position: 3 },
] as const;
```

The default-policy + default-groups together still sum to 100 like today.

**Step 2: Types.** In `types.ts`:

- Find `GradingPolicyRow` (line ~543). Replace the four `weight*` columns (`weightAssignments`, `weightQuizzes`, `weightDiscussion`, `weightFinalProject`) with nothing — keep only `weightAttendance`, `letters`, `version`, `updatedById`, `createdAt`, `updatedAt`, plus the existing `id`/`courseId`.
- Find `CategoryScoreBreakdown` (line ~556) and the `GradingPolicyCategory` import (line ~13). Replace with new types:

```ts
export interface AssignmentGroup {
  id: string;
  courseId: string;
  name: string;
  weight: number;
  position: number;
  itemCount?: number;       // populated by GET, omitted by POST/PATCH
  createdAt: string;
  updatedAt: string;
}

export interface GroupScoreItem {
  itemId: string;
  itemType: 'assignment' | 'quiz' | 'discussion';
  title: string;
  score: number | null;
  max: number;
}

export interface GroupScoreBreakdown {
  groupId: string;
  groupName: string;
  weight: number;
  itemCount: number;
  itemsScored: number;
  raw: number | null;        // 0..100 percentage, null if no scored items
  weighted: number;          // contribution to final after attendance blend
  detail: GroupScoreItem[];
}
```

Find `FinalGradeSummary` (line ~566) — change `categoryScores: CategoryScoreBreakdown | null` to `groups: GroupScoreBreakdown[]` and add an `attendance: { rate: number; weight: number; weighted: number } | null` field. Keep `gradingPolicySnapshot` field — its shape changes to `{ attendanceWeight: number; groups: Array<{ id: string; name: string; weight: number }>; letters: LetterGradeThreshold[] }`.

Delete the `GradingPolicyCategory` import (line ~13) and any remaining reference in this file (a grep for `GradingPolicyCategory` should return zero after editing).

**Step 3: Validators.** In `validators.ts`, add:

```ts
export const createAssignmentGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  weight: z.number().int().min(0).max(100),
  position: z.number().int().min(0).optional(),
});
export type CreateAssignmentGroupInput = z.infer<typeof createAssignmentGroupSchema>;

export const updateAssignmentGroupSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateAssignmentGroupInput = z.infer<typeof updateAssignmentGroupSchema>;

export const reorderAssignmentGroupsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderAssignmentGroupsInput = z.infer<typeof reorderAssignmentGroupsSchema>;
```

Find the existing `updateGradingPolicySchema` (grep for it). Remove the four weight fields, keep `weightAttendance` and `letters`. Add a brief comment noting that group weights live on assignment-group rows.

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/shared typecheck
```

Expect failure if any other file still imports `GradingPolicyCategory`. Fix imports — likely just `apps/web/src/pages/student/StudentGradePage.tsx` and possibly `apps/web/src/pages/teacher/TeacherGradingPolicyPage.tsx`. Stub their imports for now (we'll rewrite those files in Tasks 11 and 13) — easiest is to import `GroupScoreBreakdown` instead and accept that the file won't render correctly until Task 13.

Actually do NOT stub-fix consumer files in Task 1 — that creates intermediate broken states. Instead, in `constants.ts`, KEEP `GRADING_POLICY_CATEGORIES` and `GradingPolicyCategory` as a deprecated export for one task. Mark with a comment. They'll be deleted in Task 11/13 when the consumers are rewritten.

So actually Task 1 step 1 is:
- Keep `GRADING_POLICY_CATEGORIES` + `GradingPolicyCategory` (don't delete yet)
- Add the new constants/types alongside

Then the cleanup happens in Tasks 11 and 13 when the consumers are rewritten.

**Step 5: Commit.**

```bash
git add packages/shared/
git commit -m "Shared: types + validators for assignment groups"
```

---

## Task 2: Drizzle schema

**Files:**
- Modify: `apps/api/src/db/schema.ts`

**Step 1: Add the `assignmentGroups` table.** Append near other tables (alphabetical-ish — before `attendanceSessions` or wherever fits the existing layout):

```ts
export const assignmentGroups = pgTable(
  'assignment_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('assignment_groups_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('assignment_groups_course_name_idx').on(
      t.courseId,
      sql`lower(${t.name})`,
    ),
  }),
);

export type AssignmentGroupRow = typeof assignmentGroups.$inferSelect;
```

`...timestamps` and `index`/`uniqueIndex`/`sql` are already imported — verify.

**Step 2: Add `groupId` FK to `assignments`, `quizzes`, `discussionTopics`.** Find each table declaration. Add nullable column:

```ts
// inside the `assignments` table:
groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),

// inside the `quizzes` table — same shape
// inside the `discussionTopics` table — same shape
```

**Step 3: Strip the four weight columns from `gradingPolicies`.** Find the table (line ~760). Delete `weightAssignments`, `weightQuizzes`, `weightDiscussion`, `weightFinalProject`. KEEP `weightAttendance`, `lettersJson`, `version`, `updatedById`, the existing `courseId` unique index, timestamps.

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/api typecheck
```

Expect failures in `finalGrade.ts`, `gradingPolicy.ts`, possibly `routes/grading.ts` — anywhere that references the dropped columns. **Do NOT fix those yet** — that's Task 6 (finalGrade) and Task 7 (gradingPolicy). Just confirm the failures are in expected files.

Actually we need typecheck to pass for the commit gate. Either:
- (a) Stub the dropped-column references in finalGrade.ts / gradingPolicy.ts temporarily (return null / throw), so typecheck passes
- (b) Don't drop the four columns in Task 2; defer the drop to the migration (Task 3) AND a follow-up schema task (Task 6)

Go with **(b)**: in Task 2, KEEP the four columns in the Drizzle schema for now. Add the new things (table + FKs). Task 6 (finalGrade rewrite) will be where the four columns finally come out of the schema. The migration (Task 3) is the source of truth for what's actually in the DB and DOES drop them.

**Revised Step 3:** Don't touch `gradingPolicies` table in Task 2. Defer to Task 6.

**Step 5: Re-run typecheck — clean.**

**Step 6: Commit.**

```bash
git add apps/api/src/db/schema.ts
git commit -m "Schema: assignment_groups table + groupId FKs"
```

---

## Task 3: Migration SQL

**Files:**
- Create: `apps/api/drizzle/0015_assignment_groups.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

**Step 1: Hand-author the migration.** Mirror the style of `apps/api/drizzle/0014_course_deletion.sql` (which was hand-authored after the team's snapshot-drift issue made `drizzle-kit generate` unreliable).

```sql
-- Canvas-style assignment groups. Per-course named buckets that replace the
-- five hardcoded grading-policy weight columns. Attendance stays as a
-- course-level weight; everything else moves into groups.
--   1. Create the assignment_groups table.
--   2. Add nullable group_id FKs on assignments, quizzes, discussion_topics.
--   3. Backfill four default groups per existing course with weights pulled
--      from grading_policies.
--   4. Assign every existing item to its default group (using the legacy
--      isFinalProjectTitle keyword pattern for "Final Project").
--   5. Drop the four legacy weight columns from grading_policies.
--   6. Flag every final_grades row as outdated so teachers re-finalize.

CREATE TABLE IF NOT EXISTS "assignment_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "name" text NOT NULL,
  "weight" integer NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_groups" ADD CONSTRAINT "assignment_groups_course_id_courses_id_fk"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_groups_course_idx" ON "assignment_groups" USING btree ("course_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_groups_course_name_idx" ON "assignment_groups" USING btree ("course_id", lower("name"));
--> statement-breakpoint
ALTER TABLE "assignments"        ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "quizzes"            ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "discussion_topics"  ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Backfill: four default groups per existing course, weights from the legacy
-- grading_policies row. Each course's existing items are then assigned to
-- the right group. The legacy isFinalProjectTitle keyword set is inlined here
-- once; the helper is deleted from the codebase in Task 6.

WITH defaults AS (
  SELECT
    gp.course_id,
    gp.weight_assignments    AS w_assignments,
    gp.weight_quizzes        AS w_quizzes,
    gp.weight_discussion     AS w_discussion,
    gp.weight_final_project  AS w_final_project
  FROM grading_policies gp
),
seed AS (
  INSERT INTO assignment_groups (course_id, name, weight, position)
  SELECT course_id, 'Assignments',   w_assignments,    0 FROM defaults
  UNION ALL
  SELECT course_id, 'Quizzes',       w_quizzes,        1 FROM defaults
  UNION ALL
  SELECT course_id, 'Discussion',    w_discussion,     2 FROM defaults
  UNION ALL
  SELECT course_id, 'Final Project', w_final_project,  3 FROM defaults
  RETURNING id, course_id, name
)
INSERT INTO assignment_groups_seeded_marker (id) SELECT 'noop'::text WHERE false;
-- (The trailing INSERT-into-nonexistent is a guard that errors loudly if the
-- statement above somehow doesn't run; comment it out if it bothers you.)
-- (Actually drop the marker — Postgres won't accept INSERT into a missing table.)

--> statement-breakpoint

UPDATE assignments a
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = a.course_id
   AND (
     (ag.name = 'Final Project' AND (
        lower(a.title) LIKE '%final project%' OR
        lower(a.title) LIKE '%final_project%' OR
        lower(a.title) LIKE '%finalproject%' OR
        a.title LIKE '%期末%' OR
        a.title LIKE '%结业%'
     ))
     OR (ag.name = 'Assignments' AND NOT (
        lower(a.title) LIKE '%final project%' OR
        lower(a.title) LIKE '%final_project%' OR
        lower(a.title) LIKE '%finalproject%' OR
        a.title LIKE '%期末%' OR
        a.title LIKE '%结业%'
     ))
   );
--> statement-breakpoint

UPDATE quizzes q
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = q.course_id AND ag.name = 'Quizzes';
--> statement-breakpoint

UPDATE discussion_topics dt
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = dt.course_id AND ag.name = 'Discussion';
--> statement-breakpoint

ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_assignments";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_quizzes";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_discussion";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_final_project";
--> statement-breakpoint

UPDATE final_grades SET is_outdated = true;
```

Clean up the malformed `seed`/`marker` CTE — that was an artifact of brainstorming. Use this simpler version:

```sql
INSERT INTO assignment_groups (course_id, name, weight, position)
SELECT course_id, 'Assignments',   weight_assignments,    0 FROM grading_policies
UNION ALL
SELECT course_id, 'Quizzes',       weight_quizzes,        1 FROM grading_policies
UNION ALL
SELECT course_id, 'Discussion',    weight_discussion,     2 FROM grading_policies
UNION ALL
SELECT course_id, 'Final Project', weight_final_project,  3 FROM grading_policies;
```

(Substitute this whole block in place of the `WITH defaults AS … INSERT …` mess.)

**Step 2: Update the journal.** Append a new entry to `apps/api/drizzle/meta/_journal.json`:

```json
{
  "idx": 15,
  "version": "7",
  "when": <one-day-after-0014>,
  "tag": "0015_assignment_groups",
  "breakpoints": true
}
```

`when` value: take 0014's `when` and add 86400000ms (one day) — matches the cadence the team has been using.

**Step 3: Verify.**

- `cat apps/api/drizzle/0015_assignment_groups.sql` — eyeball, no malformed SQL.
- `grep "ON DELETE set null" apps/api/drizzle/0015_assignment_groups.sql` should return 3 lines (one per FK).

**Step 4: Commit.**

```bash
git add apps/api/drizzle/0015_assignment_groups.sql apps/api/drizzle/meta/_journal.json
git commit -m "Migration: 0015 assignment groups + backfill"
```

---

## Task 4: Group CRUD API + permissions test

**Files:**
- Create: `apps/api/src/routes/assignmentGroups.ts`
- Create: `apps/api/src/routes/assignmentGroups.permissions.test.ts`
- Modify: `apps/api/src/index.ts` (mount the new router)

**Step 1: Implement the router.** Routes: `GET`, `POST`, `PATCH`, `DELETE`, `POST /reorder`. Use `canWriteCourse` for writes (admin or primary teacher) and `canAccessCourse` for reads.

```ts
import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  createAssignmentGroupSchema,
  reorderAssignmentGroupsSchema,
  updateAssignmentGroupSchema,
  type CreateAssignmentGroupInput,
  type ReorderAssignmentGroupsInput,
  type UpdateAssignmentGroupInput,
} from '@coursewise/shared';
import { assignmentGroups, assignments, courses, discussionTopics, quizzes } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canAccessCourse, canWriteCourse } from '../services/courseAccess';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

r.get(
  '/courses/:courseId/assignment-groups',
  requireScopeGroup('coursesRead'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canAccessCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
    }
    // One round trip: groups joined to aggregated item counts.
    const result = await db.execute(sql`
      SELECT
        ag.id, ag.course_id AS "courseId", ag.name, ag.weight, ag.position,
        ag.created_at AS "createdAt", ag.updated_at AS "updatedAt",
        (
          (SELECT count(*) FROM assignments       a WHERE a.group_id = ag.id) +
          (SELECT count(*) FROM quizzes           q WHERE q.group_id = ag.id) +
          (SELECT count(*) FROM discussion_topics d WHERE d.group_id = ag.id)
        )::int AS "itemCount"
      FROM assignment_groups ag
      WHERE ag.course_id = ${courseId}
      ORDER BY ag.position
    `);
    return success(c, result.rows);
  },
);

r.post(
  '/courses/:courseId/assignment-groups',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(createAssignmentGroupSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateAssignmentGroupInput;

    // Compute the next position if not specified.
    let position = input.position;
    if (position === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${assignmentGroups.position}), -1)` })
        .from(assignmentGroups)
        .where(eq(assignmentGroups.courseId, courseId));
      position = (maxRow?.max ?? -1) + 1;
    }

    try {
      const [inserted] = await db
        .insert(assignmentGroups)
        .values({ courseId, name: input.name, weight: input.weight, position })
        .returning();
      if (!inserted) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create group');

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-group.create',
        target: inserted.id,
        metadata: { courseId, name: inserted.name },
      });
      return success(c, inserted, 201);
    } catch (e) {
      // unique violation on (courseId, lower(name))
      if (String(e).includes('assignment_groups_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A group with that name already exists');
      }
      throw e;
    }
  },
);

r.patch(
  '/courses/:courseId/assignment-groups/:groupId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateAssignmentGroupSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const groupId = requireParam(c, 'groupId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateAssignmentGroupInput;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.weight !== undefined) patch.weight = input.weight;
    if (input.position !== undefined) patch.position = input.position;

    try {
      const [updated] = await db
        .update(assignmentGroups)
        .set(patch)
        .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.courseId, courseId)))
        .returning();
      if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group not found');

      await recordAudit(db, {
        actorType: auth.method === 'jwt' ? 'user' : 'api_token',
        actorUserId: auth.user.id,
        actorTokenId: auth.tokenId ?? null,
        action: 'assignment-group.update',
        target: groupId,
        metadata: { courseId, fields: Object.keys(patch) },
      });
      return success(c, updated);
    } catch (e) {
      if (String(e).includes('assignment_groups_course_name_idx')) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'A group with that name already exists');
      }
      throw e;
    }
  },
);

r.delete(
  '/courses/:courseId/assignment-groups/:groupId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const groupId = requireParam(c, 'groupId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    // Count orphaned items BEFORE deleting (FK does ON DELETE SET NULL).
    const [{ count }] = (await db.execute(sql`
      SELECT (
        (SELECT count(*) FROM assignments       WHERE group_id = ${groupId}) +
        (SELECT count(*) FROM quizzes           WHERE group_id = ${groupId}) +
        (SELECT count(*) FROM discussion_topics WHERE group_id = ${groupId})
      )::int AS count
    `)).rows as Array<{ count: number }>;

    const [deleted] = await db
      .delete(assignmentGroups)
      .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.courseId, courseId)))
      .returning({ id: assignmentGroups.id });
    if (!deleted) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Group not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'assignment-group.delete',
      target: groupId,
      metadata: { courseId, orphanedItemCount: count },
    });
    return success(c, { id: groupId, orphanedItemCount: count });
  },
);

r.post(
  '/courses/:courseId/assignment-groups/reorder',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(reorderAssignmentGroupsSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as ReorderAssignmentGroupsInput;

    // Single CTE: update all positions in one round trip.
    const valuesSql = sql.join(
      input.orderedIds.map((id, idx) => sql`(${id}::uuid, ${idx})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE assignment_groups AS ag
         SET position = v.position, updated_at = now()
        FROM (VALUES ${valuesSql}) AS v(id, position)
       WHERE ag.id = v.id AND ag.course_id = ${courseId}
    `);
    return c.body(null, 204);
  },
);

export default r;
```

**Step 2: Mount in `apps/api/src/index.ts`.** Find where other routers are mounted (e.g. `app.route('/api', coursesRoutes)`). Add:

```ts
import assignmentGroupsRoutes from './routes/assignmentGroups';
// ...
app.route('/api', assignmentGroupsRoutes);
```

**Step 3: Permissions test.** Create `apps/api/src/routes/assignmentGroups.permissions.test.ts`. Copy env literal from `cou13.permissions.test.ts`. Tests:

```ts
it('GET without auth → 401');
it('POST without auth → 401');
it('PATCH without auth → 401');
it('DELETE without auth → 401');
it('POST /reorder without auth → 401');
```

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/api test -- assignmentGroups.permissions
pnpm --filter @coursewise/api typecheck
```

Both clean.

**Step 5: Commit.**

```bash
git add apps/api/src/routes/assignmentGroups.ts apps/api/src/routes/assignmentGroups.permissions.test.ts apps/api/src/index.ts
git commit -m "API: assignment-groups CRUD + reorder"
```

---

## Task 5: Add `groupId` to assignment/quiz/discussion update validators

**Files:**
- Modify: `packages/shared/src/validators.ts`
- Modify: `apps/api/src/routes/assignments.ts`
- Modify: `apps/api/src/routes/quizzes.ts`
- Modify: `apps/api/src/routes/discussions.ts` (or whatever file holds discussion-topic PATCH)

**Step 1: Validators.** Find the existing `updateAssignmentSchema`, `updateQuizSchema`, and `updateDiscussionTopicSchema` (or equivalent — grep `update.*Schema.*z\.object` in validators.ts). Add to each:

```ts
groupId: z.string().uuid().nullable().optional(),
```

If validators for create exist for any of these, add the same line to them too.

**Step 2: Route handlers.** In each route's PATCH handler, when applying the patch, include `groupId` in the SET clause if the input has it. Example:

```ts
if (input.groupId !== undefined) patch.groupId = input.groupId;
```

Same pattern in three files.

**Step 3: Verify.**

```bash
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/api test
```

All clean. No existing tests should break — we only added optional fields.

**Step 4: Commit.**

```bash
git add packages/shared/src/validators.ts apps/api/src/routes/assignments.ts apps/api/src/routes/quizzes.ts apps/api/src/routes/discussions.ts
git commit -m "API: accept groupId on assignment/quiz/discussion PATCH"
```

---

## Task 6: Rewrite `finalGrade.ts` algorithm + tests + drop legacy schema columns

**Files:**
- Modify: `apps/api/src/services/finalGrade.ts`
- Modify: `apps/api/src/services/finalGrade.test.ts`
- Modify: `apps/api/src/db/schema.ts` (finally drop the four columns)
- Modify: `packages/shared/src/constants.ts` (delete `GRADING_POLICY_CATEGORIES` and `GradingPolicyCategory`)
- Modify: `packages/shared/src/types.ts` (remove the four `weight*` fields from `GradingPolicyRow` if not done in Task 1; verify)

**Step 1: Delete the four `weight*` columns** from `gradingPolicies` in `apps/api/src/db/schema.ts`. Also delete `GRADING_POLICY_CATEGORIES` and `GradingPolicyCategory` from `constants.ts`. Update the `GradingPolicyRow` type in `types.ts` if any of the old fields linger.

**Step 2: Rewrite `finalGrade.ts`.** Replace the existing `computeWeightedScore` and surrounding helpers with the new algorithm:

```ts
// Compute the per-group breakdown and the blended final score.
//
//   groupsScore  = Σ(group.raw × group.weight) / Σ(weight where group.raw ≠ null)
//   finalScore   = (attendanceRate × attendanceWeight + groupsScore × (100-attendanceWeight)) / 100
//
// Missing pieces (no attendance sessions, no scored groups) redistribute
// their weight to whichever side has data, matching the legacy behavior at
// the group level instead of the category level.

export function computeFinalScore(input: {
  groups: Array<{
    id: string;
    name: string;
    weight: number;
    items: Array<{ id: string; type: 'assignment' | 'quiz' | 'discussion'; title: string; score: number | null; max: number }>;
  }>;
  attendance: { rate: number | null; weight: number };
}): {
  score: number | null;
  letterInput: number | null;
  groups: GroupScoreBreakdown[];
  attendance: { rate: number; weight: number; weighted: number } | null;
} {
  const attendanceWeight = input.attendance.weight;
  const otherWeight = 100 - attendanceWeight;

  const groups: GroupScoreBreakdown[] = input.groups.map((g) => {
    const scoredItems = g.items.filter((i) => i.score !== null && i.max > 0);
    const raw =
      scoredItems.length > 0
        ? scoredItems.reduce((acc, i) => acc + (i.score! / i.max) * 100, 0) / scoredItems.length
        : null;
    return {
      groupId: g.id,
      groupName: g.name,
      weight: g.weight,
      itemCount: g.items.length,
      itemsScored: scoredItems.length,
      raw,
      weighted: 0, // filled below after normalization
      detail: g.items.map((i) => ({
        itemId: i.id,
        itemType: i.type,
        title: i.title,
        score: i.score,
        max: i.max,
      })),
    };
  });

  const usable = groups.filter((g) => g.raw !== null);
  const totalUsableWeight = usable.reduce((acc, g) => acc + g.weight, 0);
  let groupsScore: number | null = null;
  if (totalUsableWeight > 0) {
    groupsScore = usable.reduce((acc, g) => acc + (g.raw! * g.weight) / totalUsableWeight, 0);
  }

  // Fill `weighted` for each group: its contribution to the final score.
  for (const g of groups) {
    if (g.raw === null) {
      g.weighted = 0;
    } else {
      g.weighted = (g.raw * g.weight) / 100 * (otherWeight / 100);
    }
  }

  const attendanceUsable = input.attendance.rate !== null && attendanceWeight > 0;
  let attendance: { rate: number; weight: number; weighted: number } | null = null;
  if (attendanceUsable) {
    attendance = {
      rate: input.attendance.rate!,
      weight: attendanceWeight,
      weighted: (input.attendance.rate! * attendanceWeight) / 100,
    };
  }

  // Final score with redistribution if one side is null.
  let score: number | null;
  if (groupsScore === null && !attendanceUsable) {
    score = null;
  } else if (groupsScore === null) {
    score = input.attendance.rate!;
  } else if (!attendanceUsable) {
    score = groupsScore;
  } else {
    score = (input.attendance.rate! * attendanceWeight + groupsScore * otherWeight) / 100;
  }

  return { score, letterInput: score, groups, attendance };
}
```

The data-loading function that calls this (currently `summarizeFinalGrade` or similar in the same file) must change to fetch:
- The course's `assignment_groups` ordered by `position`.
- Every assignment, quiz, discussion_topic for the course, joined with its `groupId`.
- The student's submission scores for each item (existing logic — preserve).
- The attendance rate (existing logic — preserve).

Delete `isFinalProjectTitle()` and the keyword-detection branches that referenced it.

**Step 3: Rewrite `finalGrade.test.ts`.** The existing 7 tests are around the five-category algorithm. Replace with:

- One group, one fully-scored item, no attendance → score equals item percentage.
- One group, one item, attendance weight 10% + rate 100% → score blended correctly.
- Two groups with mixed completeness → null group skipped, remaining group carries full weight.
- All groups null, attendance present → score equals attendance rate.
- All groups null, no attendance → score is null.
- Multiple items in one group → group's raw is the mean of item percentages.

At least 6 cases. Use direct calls to `computeFinalScore` (the pure function) with synthesized input — no DB.

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/api test -- finalGrade
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/web typecheck
```

The web typecheck WILL FAIL — the student/teacher gradebook pages still expect the old shape. That's OK for this task; we fix them in Tasks 11+13. So instead: only require the API typecheck to be clean. Note the failures in the web side and don't fix them here.

Actually we can't merge until web typecheck is also clean, but we can defer that to Task 11/13. Just commit the API changes and proceed.

**Step 5: Commit.**

```bash
git add apps/api/src/services/finalGrade.ts apps/api/src/services/finalGrade.test.ts apps/api/src/db/schema.ts packages/shared/src/constants.ts packages/shared/src/types.ts
git commit -m "API: finalGrade rewrites around assignment groups"
```

---

## Task 7: Sum-to-100 enforcement at finalize

**Files:**
- Modify: `apps/api/src/routes/grading.ts` (or wherever the finalize endpoint lives — grep `finalize` in `apps/api/src/routes/`)

**Step 1:** Find the finalize endpoint. Add a precondition check:

```ts
const groups = await db
  .select({ weight: assignmentGroups.weight })
  .from(assignmentGroups)
  .where(eq(assignmentGroups.courseId, courseId));
const total = groups.reduce((acc, g) => acc + g.weight, 0);
if (total !== 100) {
  throw new ApiException(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    `Assignment group weights must sum to 100 (currently ${total})`,
  );
}
```

Place this check BEFORE the actual finalization logic kicks in.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/api test
```

Clean (or web-failures only, as noted in Task 6).

**Step 3: Commit.**

```bash
git add apps/api/src/routes/grading.ts
git commit -m "API: finalize requires sum-to-100 group weights"
```

---

## Task 8: Integration test — assignment groups CRUD + finalGrade math

**Files:**
- Create: `apps/api/src/routes/assignmentGroups.integration.test.ts`

Mirror `courseDeletion.integration.test.ts` structure. `describe.skipIf(!hasDb)`.

Tests:

1. **CRUD** — create three groups in a course, GET returns them ordered by position, PATCH updates name + weight, DELETE returns orphanedItemCount.
2. **Uniqueness** — POSTing a second group with the same name (case-insensitive) → 409.
3. **Reorder** — POST /reorder with reversed `orderedIds` updates positions.
4. **Delete leaves items orphaned** — assign an assignment to a group, DELETE the group, assert `assignments.group_id IS NULL` for that row.
5. **finalGrade computes correctly** — seed a course with three groups (weights 40/30/30), attendance weight 0, two scored assignments in group 1, one scored quiz in group 2, no items in group 3 → compute final, assert it matches a hand-calculated expectation.

**Step 1:** Implement.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/api test -- assignmentGroups.integration
pnpm --filter @coursewise/api typecheck
```

Tests should skip without DB.

**Step 3: Commit.**

```bash
git add apps/api/src/routes/assignmentGroups.integration.test.ts
git commit -m "Test: assignment groups CRUD + finalGrade math integration"
```

---

## Task 9: Migration smoke test

**Files:**
- Create: `apps/api/src/routes/assignmentGroups.migration.test.ts` (or place under `apps/api/src/db/`)

**Step 1:** Write a `describe.skipIf(!hasDb)` test that:

1. Inserts a `grading_policies` row with the old 5-weight shape via raw SQL (predating the migration — this requires the migration to have already run on the DB though, which it has). Skip this approach — it doesn't work.

**Alternative — just smoke-verify post-migration state:**

1. Inserts a course + a default `grading_policies` row.
2. Runs the migration's backfill statements manually (or trusts that the migration already ran). Asserts exactly 4 assignment_groups rows exist for that course with the right weights + positions.

Actually a clean isolated migration test is hard without test fixtures. **Defer**. Skip this task and rely on:
- The manual smoke check in Task 15.
- The team running the migration on staging before production.

**Skip Task 9 entirely. The integration test in Task 8 covers the post-migration CRUD path.**

(If the executor still wants migration coverage, they can write a manual test script in `apps/api/scripts/` instead — out of scope here.)

---

## Task 10: Front-end queries

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

**Step 1:** Add five hooks:

```ts
import type { AssignmentGroup } from '@coursewise/shared';

export function useAssignmentGroups(courseId: string | undefined) {
  return useQuery({
    queryKey: ['assignment-groups', courseId],
    queryFn: () => apiCall<AssignmentGroup[]>(`/api/courses/${courseId}/assignment-groups`),
    enabled: !!courseId,
  });
}

export function useCreateAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; weight: number; position?: number }) =>
      apiCall<AssignmentGroup>(`/api/courses/${courseId}/assignment-groups`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      qc.invalidateQueries({ queryKey: ['final-grade', courseId] });
    },
  });
}

export function useUpdateAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...patch }: { groupId: string; name?: string; weight?: number; position?: number }) =>
      apiCall<AssignmentGroup>(`/api/courses/${courseId}/assignment-groups/${groupId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      qc.invalidateQueries({ queryKey: ['final-grade', courseId] });
    },
  });
}

export function useDeleteAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiCall<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      qc.invalidateQueries({ queryKey: ['final-grade', courseId] });
    },
  });
}

export function useReorderAssignmentGroups(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiCall<void>(`/api/courses/${courseId}/assignment-groups/reorder`, {
        method: 'POST',
        body: { orderedIds },
        raw: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
    },
  });
}
```

Note: `raw: true` for reorder because it returns 204 (no body). Pattern same as `useRetryR2Cleanup` shipped earlier — copy that exactly.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
```

May still fail because of broken consumers — that's OK; defer fix to Tasks 11/13.

**Step 3: Commit.**

```bash
git add apps/web/src/lib/queries.ts
git commit -m "Web: assignment-group hooks"
```

---

## Task 11: `TeacherGradingPolicyPage` rewrite

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherGradingPolicyPage.tsx`

The current page has four hardcoded weight inputs. Replace with:

- A single Attendance Weight input (saves via existing `useUpdateGradingPolicy`).
- A sortable list of groups (using `useAssignmentGroups`, `useCreateAssignmentGroup`, `useUpdateAssignmentGroup`, `useDeleteAssignmentGroup`, `useReorderAssignmentGroups`).
- An amber banner when `sum(group weights) ≠ 100`.

**Step 1:** Find the current `TeacherGradingPolicyPage`. Strip out the four hardcoded weight inputs. Add the groups list:

```tsx
const groups = useAssignmentGroups(courseId);
const create = useCreateAssignmentGroup(courseId);
const update = useUpdateAssignmentGroup(courseId);
const del = useDeleteAssignmentGroup(courseId);
// reorder hook used if drag-drop is added; skip drag-drop for v1, use up/down buttons instead

const totalWeight = (groups.data ?? []).reduce((acc, g) => acc + g.weight, 0);
const balanced = totalWeight === 100;

return (
  <div>
    {/* Attendance weight section — single input, existing useUpdateGradingPolicy */}
    {/* Groups section — list of groups */}
    {groups.data?.map((g) => (
      <div key={g.id} className="flex gap-2 items-center">
        <input value={g.name} onBlur={(e) => update.mutate({ groupId: g.id, name: e.target.value })} />
        <input type="number" value={g.weight} onBlur={(e) => update.mutate({ groupId: g.id, weight: Number(e.target.value) })} />
        <span>items: {g.itemCount ?? 0}</span>
        <button onClick={() => del.mutate(g.id)}>Delete</button>
      </div>
    ))}
    <button onClick={() => create.mutate({ name: 'New group', weight: 0 })}>+ Add group</button>
    {!balanced && (
      <div className="rounded bg-amber-50 p-3 text-amber-800">
        Group weights total {totalWeight}% — should be 100%.
      </div>
    )}
  </div>
);
```

For v1 skip drag-drop reordering — use up/down arrow buttons or skip reordering entirely. Position is set by the server on create; teacher can edit position via PATCH if they really want.

Hard-code English. Task 14 i18ns.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
pnpm --filter @coursewise/web test
```

Should now be clean — this page was the main blocker.

**Step 3: Commit.**

```bash
git add apps/web/src/pages/teacher/TeacherGradingPolicyPage.tsx
git commit -m "Web: TeacherGradingPolicyPage becomes groups editor"
```

---

## Task 12: Group picker on item edit pages

**Files:**
- Modify: assignment edit page (grep `TeacherAssignment.*\\.tsx` to find — likely `TeacherAssignmentsPage` or `TeacherAssignmentEditPage`)
- Modify: quiz edit page (likely `TeacherQuizzesPage` or `TeacherQuizEditPage`)
- Modify: discussion edit page (likely `TeacherDiscussionsPage` or `TeacherDiscussionEditPage`)

**Step 1:** In each edit form, add a `<select>` populated from `useAssignmentGroups(courseId)`:

```tsx
const groups = useAssignmentGroups(courseId);

<label>Group</label>
<select
  value={form.groupId ?? ''}
  onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}
>
  <option value="">Unassigned</option>
  {groups.data?.map((g) => (
    <option key={g.id} value={g.id}>{g.name}</option>
  ))}
</select>
```

The PATCH endpoint already accepts `groupId` (Task 5). The existing mutation hook just needs to pass it through.

**Step 2: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
```

**Step 3: Commit.**

```bash
git add apps/web/src/pages/teacher/<the three files>
git commit -m "Web: group picker on assignment/quiz/discussion edit pages"
```

---

## Task 13: Gradebook pages rewire

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherGradebookStudentPage.tsx`
- Modify: `apps/web/src/pages/student/StudentGradePage.tsx`

**Step 1: Teacher gradebook.** The page renders five hardcoded category cards. Replace with iterating over the new `groups[]` field of the final-grade response:

```tsx
const grade = useFinalGrade(courseId, studentId);

return (
  <div>
    {/* Attendance card — only when grade.data.attendance is non-null */}
    {grade.data?.attendance && (
      <Card title="Attendance">
        {grade.data.attendance.rate}% × {grade.data.attendance.weight}% = {grade.data.attendance.weighted}
      </Card>
    )}
    {/* One card per group */}
    {grade.data?.groups.map((g) => (
      <Card key={g.groupId} title={g.groupName}>
        <div>Weight: {g.weight}% | Avg: {g.raw?.toFixed(1) ?? '—'} | Contribution: {g.weighted.toFixed(1)}</div>
        {g.detail.map((item) => (
          <div key={item.itemId}>{item.title}: {item.score ?? '—'} / {item.max}</div>
        ))}
      </Card>
    ))}
    {/* Unassigned items card — only when there are items with no group */}
    {/* For v1, the gradebook API doesn't separately return unassigned items.
        Defer to a follow-up — for now, items with no group simply don't appear. */}
  </div>
);
```

Skip the "Unassigned items" card for v1 — defer to a follow-up. Items with no group simply don't contribute to the final grade and don't appear in the gradebook. The TeacherGradingPolicyPage shows item counts per group, so the teacher can see if items are missing.

**Step 2: Student gradebook.** `StudentGradePage.tsx` currently iterates over the 4 hardcoded categories (lines 9-12). Replace with the same group-iteration pattern, but read-only. The category-label map at top of file gets deleted.

**Step 3: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
pnpm --filter @coursewise/web test
```

Both clean.

**Step 4: Commit.**

```bash
git add apps/web/src/pages/teacher/TeacherGradebookStudentPage.tsx apps/web/src/pages/student/StudentGradePage.tsx
git commit -m "Web: gradebook pages render assignment groups"
```

---

## Task 14: Locale strings

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

**Step 1:** Required new keys (every key MUST exist in both files):

```
teacher.gradingPolicy.attendance.label    — "Attendance weight" / 出勤权重
teacher.gradingPolicy.groups.title        — "Assignment groups" / 作业分组
teacher.gradingPolicy.groups.add          — "Add group" / 添加分组
teacher.gradingPolicy.groups.delete       — "Delete" / 删除
teacher.gradingPolicy.groups.namePlaceholder — "Group name" / 分组名称
teacher.gradingPolicy.groups.weightLabel  — "Weight (%)" / 权重 (%)
teacher.gradingPolicy.groups.itemsCount   — "{{count}} items" / {{count}} 项
teacher.gradingPolicy.groups.imbalanced   — "Group weights total {{total}}% — should be 100%" / 分组权重合计 {{total}}% — 应为 100%

teacher.gradebook.attendance.title        — "Attendance" / 出勤
teacher.gradebook.group.weight            — "Weight" / 权重
teacher.gradebook.group.avg               — "Average" / 平均分
teacher.gradebook.group.contribution      — "Contribution" / 贡献分

item.group.label                           — "Group" / 分组
item.group.unassigned                      — "Unassigned" / 未分组
```

**Step 2:** Replace hard-coded English in the modified components with `t()` calls.

**Step 3: Delete old grading keys.** The four keys `grading.weightAssignments`, `grading.weightQuizzes`, `grading.weightDiscussion`, `grading.weightFinalProject` (en.ts line 864-867, zh-CN.ts line 851-854) are no longer used — delete them.

**Step 4: Verify.**

```bash
pnpm --filter @coursewise/web typecheck
pnpm --filter @coursewise/web test
```

Clean.

**Step 5: Commit.**

```bash
git add apps/web/src/locales/ apps/web/src/pages/teacher/TeacherGradingPolicyPage.tsx apps/web/src/pages/teacher/TeacherGradebookStudentPage.tsx apps/web/src/pages/student/StudentGradePage.tsx
git commit -m "i18n: assignment groups + gradebook strings"
```

---

## Task 15: Full repo verification

```bash
pnpm typecheck
pnpm test
pnpm lint
```

All three clean.

Manual smoke (only if a local DB is available — `DATABASE_URL` set):

1. Run `pnpm --filter @coursewise/api db:migrate` to apply `0015_assignment_groups.sql`.
2. Existing seeded course: open Teacher → Grading Policy. Confirm four groups appear with names "Assignments", "Quizzes", "Discussion", "Final Project" and weights matching the old policy.
3. Add a new group named "Lab", weight 10. Confirm banner shows "Group weights total 110%". Drop the Quizzes weight to 20. Banner disappears.
4. Open an existing quiz → Group dropdown → switch to "Lab" → save. Reload Teacher → Grading Policy: Quizzes shows N-1 items, Lab shows 1 item.
5. Open the student gradebook for a student in the course: confirm cards render correctly with new groups.

If no local DB, skip the smoke and verify on staging post-merge.

No new commit — verification only.

---

## Task 16: Push, PR, merge

```bash
git push -u origin assignment-groups
gh pr create --title "Canvas-style assignment groups" --body "$(cat <<'EOF'
## Summary
- Replaces the five hardcoded grading categories with user-defined per-course assignment groups
- Attendance stays as a course-level weight; everything else lives in user-defined groups
- One hand-authored migration creates the table, backfills 4 default groups per existing course with weights copied from the old policy, assigns existing items, then drops the old columns
- finalGrade.ts rewrites around per-group averages blended with attendance
- TeacherGradingPolicyPage becomes a groups editor; teacher/student gradebooks rewire to render per-course groups

## Test plan
- [ ] pnpm typecheck + test + lint clean
- [ ] DB integration: pnpm --filter @coursewise/api test -- assignmentGroups.integration (with DATABASE_URL)
- [ ] Manual: existing course pre-migration → post-migration shows 4 default groups
- [ ] Manual: add a group, reassign an item, verify gradebook reflects change
- [ ] Manual: delete a group with items, verify items show as orphaned

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Notes for the executor

- **Migration is the load-bearing part of this PR.** If the backfill SQL is buggy, every existing course gets wrong default groups. Eyeball the SQL carefully before merging.
- **The `isFinalProjectTitle` helper is deleted in Task 6.** Make sure the migration uses the same keyword list (`%final project%`, `%final_project%`, `%finalproject%`, `%期末%`, `%结业%`) — inline it in the SQL.
- **Web typecheck will be temporarily broken** between Tasks 6 (when we delete `GradingPolicyCategory`) and Task 13 (when the gradebook pages are rewritten). Commit anyway; the final Task 15 verifies everything's clean.
- **No drop-lowest, no per-item rules.** YAGNI. Future enhancements.
- **`recordAudit` lives outside any CTE.** If the audit insert fails, the group action still succeeded.
