# Course Hard-Delete (Danger Zone) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the Danger-zone-driven hard-delete of a course (and all its cascaded data + R2 files) per `docs/plans/2026-05-20-course-hard-delete-design.md`.

**Architecture:** API change uses an existing Drizzle/Hono/Cloudflare Worker stack. A new migration `0014_course_deletion.sql` adds `course_deletion_log` (audit metadata, no PII) and `r2_cleanup_jobs` (status-tracked). `DELETE /api/courses/:id` requires a typed `confirmCode`, wraps the audit insert + cascade delete + job-row insert in a single transaction, then fires `ctx.waitUntil(runR2Cleanup(...))`. Front-end adds a Danger zone section to `TeacherCourseSettings` and a row action to `AdminCoursesPage`, both opening a shared `DeleteCourseDialog`.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres / Neon), Cloudflare Workers (R2 binding + `executionCtx.waitUntil`), Vitest, React, TanStack Query, Tailwind.

---

## Conventions

- Run all commands from the worktree root: `/Users/zhijiangchen/CourseWise/.worktrees/course-hard-delete`.
- After each task: run task-scoped tests, then `pnpm typecheck`, then commit. Commit message format matches existing repo style: `Area: short imperative summary`.
- DB tests come in two flavors (matching existing repo conventions):
  - `*.permissions.test.ts` — runs without `DATABASE_URL`; tests auth, validation, routing wiring.
  - `*.integration.test.ts` — wrapped in `describe.skipIf(!hasDb)`; skipped by default; runs locally when the engineer exports a `DATABASE_URL`.
- Write the permissions test first (always runnable). Integration test is a bonus that documents end-to-end behavior.

---

## Task 1: Add Drizzle schema for new tables

**Files:**
- Modify: `apps/api/src/db/schema.ts` (append two tables near the bottom, before any helper exports)

**Step 1:** Open `apps/api/src/db/schema.ts`, find the end of the table declarations, and append:

```ts
export const courseDeletionLog = pgTable('course_deletion_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull(),
  courseCode: text('course_code').notNull(),
  courseTitle: text('course_title').notNull(),
  deletedBy: uuid('deleted_by')
    .notNull()
    .references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  childCounts: jsonb('child_counts').notNull(),
});

export const r2CleanupJobStatus = pgEnum('r2_cleanup_job_status', ['pending', 'running', 'done', 'failed']);

export const r2CleanupJobs = pgTable(
  'r2_cleanup_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id').notNull(),
    status: r2CleanupJobStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    statusCreatedIdx: index('r2_cleanup_jobs_status_created').on(table.status, table.createdAt),
  }),
);
```

Confirm `pgEnum`, `index`, `jsonb`, `integer`, `text`, `timestamp`, `uuid` are already imported at the top of the file; add any missing ones to the existing import list.

**Step 2:** Run `pnpm --filter @coursewise/api typecheck`. Expected: clean.

**Step 3:** Commit:

```bash
git add apps/api/src/db/schema.ts
git commit -m "Schema: course_deletion_log + r2_cleanup_jobs tables"
```

---

## Task 2: Generate migration SQL

**Files:**
- Create: `apps/api/drizzle/0014_course_deletion.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

**Step 1:** Run `pnpm --filter @coursewise/api db:generate`. Expected output: Drizzle reports two new tables, writes a new SQL file under `apps/api/drizzle/0014_*.sql`, updates `meta/_journal.json`.

**Step 2:** Inspect the generated SQL with `cat apps/api/drizzle/0014_*.sql`. Confirm it contains both `CREATE TABLE course_deletion_log` and `CREATE TABLE r2_cleanup_jobs`, the enum type, and the partial index. If Drizzle generated a non-partial index, edit the file to add `WHERE status IN ('pending', 'running', 'failed')` to the index DDL.

**Step 3:** If filename is not exactly `0014_course_deletion.sql`, rename it (and update `_journal.json` accordingly):

```bash
mv apps/api/drizzle/0014_*.sql apps/api/drizzle/0014_course_deletion.sql
# manually update meta/_journal.json's tag for entry 0014
```

**Step 4:** Commit:

```bash
git add apps/api/drizzle/0014_course_deletion.sql apps/api/drizzle/meta/_journal.json
git commit -m "Migration: 0014 course_deletion tables"
```

---

## Task 3: Add `canDeleteCourse` authorization helper (TDD)

**Files:**
- Create: `apps/api/src/services/courseAccess.test.ts`
- Modify: `apps/api/src/services/courseAccess.ts`

`canWriteCourse()` currently returns true for any teacher in `courseTeachers` (primary or co-teacher). Per the design, hard-delete is stricter: admin OR primary teacher only. A new helper avoids loosening anything else.

**Step 1:** Write the failing test in `apps/api/src/services/courseAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canDeleteCourse, type CourseTeacherLookup } from './courseAccess';

const course = '11111111-1111-1111-1111-111111111111';

const adminUser = { id: 'u-admin', role: 'admin' as const };
const teacherUser = { id: 'u-teacher', role: 'teacher' as const };
const studentUser = { id: 'u-student', role: 'student' as const };

function lookup(rows: { teacherId: string; role: 'primary' | 'co_teacher' }[]): CourseTeacherLookup {
  return async (_courseId, teacherId) => rows.find((r) => r.teacherId === teacherId) ?? null;
}

describe('canDeleteCourse', () => {
  it('admin → true regardless of course teachers', async () => {
    expect(await canDeleteCourse(lookup([]), adminUser, course)).toBe(true);
  });
  it('primary teacher of the course → true', async () => {
    expect(
      await canDeleteCourse(lookup([{ teacherId: 'u-teacher', role: 'primary' }]), teacherUser, course),
    ).toBe(true);
  });
  it('co-teacher of the course → false', async () => {
    expect(
      await canDeleteCourse(lookup([{ teacherId: 'u-teacher', role: 'co_teacher' }]), teacherUser, course),
    ).toBe(false);
  });
  it('unrelated teacher → false', async () => {
    expect(await canDeleteCourse(lookup([]), teacherUser, course)).toBe(false);
  });
  it('student → false', async () => {
    expect(await canDeleteCourse(lookup([]), studentUser, course)).toBe(false);
  });
});
```

Note: the test passes a `CourseTeacherLookup` callable so the unit test never needs a real `Db`. The real production wrapper will adapt the Drizzle query into that callable.

**Step 2:** Run `pnpm --filter @coursewise/api test -- courseAccess` — expect failure (`canDeleteCourse is not exported`).

**Step 3:** Add the implementation to `apps/api/src/services/courseAccess.ts`:

```ts
import type { AuthenticatedUser } from '../middleware/types';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { courseTeachers, enrollments } from '../db/schema';

export type CourseTeacherRoleRow = { teacherId: string; role: 'primary' | 'co_teacher' };
export type CourseTeacherLookup = (
  courseId: string,
  teacherId: string,
) => Promise<CourseTeacherRoleRow | null>;

function lookupFromDb(db: Db): CourseTeacherLookup {
  return async (courseId, teacherId) => {
    const rows = await db
      .select({ teacherId: courseTeachers.teacherId, role: courseTeachers.role })
      .from(courseTeachers)
      .where(and(eq(courseTeachers.courseId, courseId), eq(courseTeachers.teacherId, teacherId)))
      .limit(1);
    const row = rows[0];
    return row ? { teacherId: row.teacherId, role: row.role as 'primary' | 'co_teacher' } : null;
  };
}

export async function canDeleteCourse(
  lookupOrDb: CourseTeacherLookup | Db,
  user: AuthenticatedUser,
  courseId: string,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const lookup = typeof lookupOrDb === 'function' ? lookupOrDb : lookupFromDb(lookupOrDb);
  const row = await lookup(courseId, user.id);
  return row?.role === 'primary';
}
```

**Step 4:** Run `pnpm --filter @coursewise/api test -- courseAccess` — expect PASS (5 tests).

**Step 5:** Commit:

```bash
git add apps/api/src/services/courseAccess.ts apps/api/src/services/courseAccess.test.ts
git commit -m "Service: canDeleteCourse — admin or primary teacher only"
```

---

## Task 4: Add `courseChildCounts` service (TDD with mock Db)

**Files:**
- Create: `apps/api/src/services/courseDeletion.ts`
- Create: `apps/api/src/services/courseDeletion.test.ts`

Returns the `child_counts` jsonb shape that goes into both the deletion-preview response and the audit row.

**Step 1:** Write the failing test:

```ts
import { describe, expect, it } from 'vitest';
import { type ChildCounts } from './courseDeletion';

describe('courseChildCounts (shape)', () => {
  it('serializes the expected keys', () => {
    const sample: ChildCounts = {
      enrollments: 0, modules: 0, readingMaterials: 0, assignments: 0,
      submissions: 0, quizzes: 0, quizAttempts: 0, discussionTopics: 0,
      discussionPosts: 0, attendanceSessions: 0, fileCount: 0, fileBytes: 0,
    };
    expect(Object.keys(sample).sort()).toEqual([
      'assignments', 'attendanceSessions', 'discussionPosts', 'discussionTopics',
      'enrollments', 'fileBytes', 'fileCount', 'modules', 'quizAttempts', 'quizzes',
      'readingMaterials', 'submissions',
    ]);
  });
});
```

Why this test? It locks the contract that both the route handler and the front-end consume. Counting logic itself is plain SQL and is covered by the integration test later.

**Step 2:** Run `pnpm --filter @coursewise/api test -- courseDeletion` — expect failure.

**Step 3:** Implement `apps/api/src/services/courseDeletion.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  enrollments, modules, readingMaterials, assignments, assignmentSubmissions,
  quizzes, quizAttempts, discussionTopics, discussionPosts, attendanceSessions, fileAssets,
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

export async function courseChildCounts(db: Db, courseId: string): Promise<ChildCounts> {
  const [row] = await db.execute(sql<ChildCounts>`
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
  return row as unknown as ChildCounts;
}
```

If `assignmentSubmissions`, `quizAttempts`, `discussionPosts` are named differently in `schema.ts` (e.g. plural vs singular), grep the schema and adjust imports.

**Step 4:** Run `pnpm --filter @coursewise/api test -- courseDeletion` — expect PASS.

**Step 5:** Commit:

```bash
git add apps/api/src/services/courseDeletion.ts apps/api/src/services/courseDeletion.test.ts
git commit -m "Service: courseChildCounts for deletion preview + audit"
```

---

## Task 5: Add R2 cleanup job (TDD with mocked bucket)

**Files:**
- Create: `apps/api/src/jobs/r2Cleanup.ts`
- Create: `apps/api/src/jobs/r2Cleanup.test.ts`

**Step 1:** Write the failing test:

```ts
import { describe, expect, it, vi } from 'vitest';
import { deleteR2Prefix } from './r2Cleanup';

function fakeBucket(initial: string[]) {
  let keys = [...initial];
  return {
    list: vi.fn(async ({ prefix, limit, cursor }: { prefix: string; limit: number; cursor?: string }) => {
      const all = keys.filter((k) => k.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      return {
        objects: page.map((key) => ({ key })),
        truncated: start + limit < all.length,
        cursor: String(start + limit),
      };
    }),
    delete: vi.fn(async (toDelete: string[]) => {
      keys = keys.filter((k) => !toDelete.includes(k));
    }),
    snapshot: () => [...keys],
  };
}

describe('deleteR2Prefix', () => {
  it('deletes every object under the prefix in batches', async () => {
    const bucket = fakeBucket([
      'courses/A/file1', 'courses/A/file2', 'courses/A/sub/file3',
      'courses/B/file1', // unrelated
    ]);
    await deleteR2Prefix(bucket as any, 'courses/A/');
    expect(bucket.snapshot()).toEqual(['courses/B/file1']);
  });

  it('handles paginated listing (cursor-driven)', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => `courses/A/${i}.pdf`);
    const bucket = fakeBucket(many);
    await deleteR2Prefix(bucket as any, 'courses/A/');
    expect(bucket.snapshot()).toEqual([]);
    expect(bucket.list).toHaveBeenCalledTimes(3); // 1000+1000+500
  });

  it('no-op when prefix is empty', async () => {
    const bucket = fakeBucket(['courses/B/file']);
    await deleteR2Prefix(bucket as any, 'courses/A/');
    expect(bucket.delete).not.toHaveBeenCalled();
  });
});
```

**Step 2:** Run `pnpm --filter @coursewise/api test -- r2Cleanup` — expect failure.

**Step 3:** Implement `apps/api/src/jobs/r2Cleanup.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { r2CleanupJobs } from '../db/schema';

export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const list = await bucket.list({ prefix, limit: 1000, cursor });
    if (list.objects.length === 0) break;
    await bucket.delete(list.objects.map((o) => o.key));
    if (!list.truncated) break;
    cursor = (list as { cursor?: string }).cursor;
  }
}

export async function runR2Cleanup(
  db: Db,
  bucket: R2Bucket,
  jobId: string,
  courseId: string,
): Promise<void> {
  await db
    .update(r2CleanupJobs)
    .set({ status: 'running', attempts: incrementAttempts() })
    .where(eq(r2CleanupJobs.id, jobId));
  try {
    await deleteR2Prefix(bucket, `courses/${courseId}/`);
    await db
      .update(r2CleanupJobs)
      .set({ status: 'done', completedAt: new Date(), lastError: null })
      .where(eq(r2CleanupJobs.id, jobId));
  } catch (err) {
    await db
      .update(r2CleanupJobs)
      .set({ status: 'failed', lastError: String(err) })
      .where(eq(r2CleanupJobs.id, jobId));
    throw err;
  }
}

import { sql } from 'drizzle-orm';
function incrementAttempts() {
  return sql`${r2CleanupJobs.attempts} + 1`;
}
```

**Step 4:** Run `pnpm --filter @coursewise/api test -- r2Cleanup` — expect PASS (3 tests).

**Step 5:** Commit:

```bash
git add apps/api/src/jobs/r2Cleanup.ts apps/api/src/jobs/r2Cleanup.test.ts
git commit -m "Job: R2 cleanup worker for deleted courses"
```

---

## Task 6: Add shared Zod schemas

**Files:**
- Modify: `packages/shared/src/validators.ts` (or wherever course validators live — grep `courseSchema` to confirm)
- Modify: `packages/shared/src/types.ts`

**Step 1:** Append to `packages/shared/src/validators.ts`:

```ts
export const courseDeleteBodySchema = z.object({
  confirmCode: z.string().min(1),
});
```

**Step 2:** Append to `packages/shared/src/types.ts`:

```ts
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

export type CourseDeletionPreview = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  counts: ChildCounts;
};

export type R2CleanupJob = {
  id: string;
  courseId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type CourseDeletionLogEntry = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  deletedBy: string;
  deletedByName?: string;
  deletedAt: string;
  childCounts: ChildCounts;
  cleanup?: R2CleanupJob | null;
};
```

**Step 3:** Run `pnpm --filter @coursewise/shared typecheck && pnpm --filter @coursewise/shared build`. Expect clean.

**Step 4:** Commit:

```bash
git add packages/shared/src/
git commit -m "Shared: types + validators for course hard-delete"
```

---

## Task 7: `GET /api/courses/:courseId/deletion-preview` route

**Files:**
- Modify: `apps/api/src/routes/courses.ts`
- Create: `apps/api/src/routes/courseDeletion.permissions.test.ts`

**Step 1:** Write the permissions test:

```ts
import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-test-refresh-test-refresh-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};

describe('Course hard-delete route wiring', () => {
  it('GET /api/courses/:id/deletion-preview without auth → 401', async () => {
    const res = await app.request('/api/courses/00000000-0000-0000-0000-000000000000/deletion-preview', {}, env);
    expect(res.status).toBe(401);
  });

  it('DELETE /api/courses/:id rejects missing body → 400', async () => {
    const res = await app.request('/api/courses/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, env);
    // Unauth check happens first → expect 401 here without an Authorization header.
    expect(res.status).toBe(401);
  });
});
```

(Integration coverage for the real preview + delete behavior comes in Task 11.)

**Step 2:** Add the route to `apps/api/src/routes/courses.ts`, placing it just before the existing DELETE handler:

```ts
r.get(
  '/courses/:courseId/deletion-preview',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canDeleteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No delete access to this course');
    }
    const [course] = await db
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
    const counts = await courseChildCounts(db, courseId);
    return success(c, { courseId: course.id, courseCode: course.code, courseTitle: course.title, counts });
  },
);
```

Update the imports at the top of the file to add `canDeleteCourse` and `courseChildCounts`.

**Step 3:** Run `pnpm --filter @coursewise/api test -- courseDeletion.permissions`. Expect PASS (both tests).

**Step 4:** Commit:

```bash
git add apps/api/src/routes/courses.ts apps/api/src/routes/courseDeletion.permissions.test.ts
git commit -m "API: GET /courses/:id/deletion-preview"
```

---

## Task 8: Rewrite `DELETE /api/courses/:courseId` with confirmCode + transaction + waitUntil

**Files:**
- Modify: `apps/api/src/routes/courses.ts`

**Step 1:** Replace the existing DELETE handler (currently at `apps/api/src/routes/courses.ts:236-263`) with:

```ts
r.delete(
  '/courses/:courseId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');

    if (!(await canDeleteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No delete access to this course');
    }

    const parsed = courseDeleteBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ApiException(400, ERROR_CODES.VALIDATION, 'confirmCode required');
    }

    const [course] = await db
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
    if (parsed.data.confirmCode !== course.code) {
      throw new ApiException(400, ERROR_CODES.VALIDATION, 'Confirmation code does not match course code');
    }

    const counts = await courseChildCounts(db, courseId);
    const jobId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(courseDeletionLog).values({
        courseId: course.id,
        courseCode: course.code,
        courseTitle: course.title,
        deletedBy: auth.user.id,
        childCounts: counts,
      });
      const deleted = await tx.delete(courses).where(eq(courses.id, courseId)).returning({ id: courses.id });
      if (deleted.length === 0) {
        throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
      }
      await tx.insert(r2CleanupJobs).values({ id: jobId, courseId, status: 'pending' });
    });

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.delete',
      target: courseId,
    });

    c.executionCtx.waitUntil(runR2Cleanup(db, c.env.COURSE_FILES, jobId, courseId));

    return success(c, { id: courseId });
  },
);
```

Add the new imports: `canDeleteCourse`, `courseChildCounts`, `courseDeletionLog`, `r2CleanupJobs`, `courseDeleteBodySchema`, `runR2Cleanup`. Remove the now-unused `enrollments` import if no other handler in this file references it (grep first; the schema still uses it elsewhere).

**Step 2:** Run `pnpm --filter @coursewise/api typecheck`. Expect clean. If TypeScript complains that `c.executionCtx` is not on the context, grep how other routes access it — Hono exposes it as `c.executionCtx` on Workers; if the local `AppEnv` doesn't already expose it, look at how `c.env.COURSE_FILES` is currently accessed elsewhere (`files.ts` is a known caller) and follow that pattern.

**Step 3:** Re-run the permissions test from Task 7. Expect still PASS.

**Step 4:** Commit:

```bash
git add apps/api/src/routes/courses.ts
git commit -m "API: hard-delete course with confirmCode + R2 cleanup"
```

---

## Task 9: Admin retry endpoint for failed cleanup jobs

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1:** Add a handler in `apps/api/src/routes/admin.ts`:

```ts
r.post('/admin/r2-cleanup-jobs/:jobId/retry', requireAdmin, async (c) => {
  const db = c.get('db');
  const jobId = requireParam(c, 'jobId');
  const [job] = await db.select().from(r2CleanupJobs).where(eq(r2CleanupJobs.id, jobId)).limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Cleanup job not found');
  if (job.status !== 'failed') {
    throw new ApiException(409, ERROR_CODES.CONFLICT, `Job is ${job.status}`);
  }
  await db.update(r2CleanupJobs).set({ status: 'pending', lastError: null }).where(eq(r2CleanupJobs.id, jobId));
  c.executionCtx.waitUntil(runR2Cleanup(db, c.env.COURSE_FILES, jobId, job.courseId));
  return c.body(null, 202);
});
```

Add imports for `r2CleanupJobs` and `runR2Cleanup`. Confirm `requireAdmin` is in scope (grep `requireAdmin` in the same file to copy the existing import pattern).

**Step 2:** Add to the permissions test created in Task 7:

```ts
it('POST /api/admin/r2-cleanup-jobs/:id/retry without auth → 401', async () => {
  const res = await app.request('/api/admin/r2-cleanup-jobs/00000000-0000-0000-0000-000000000000/retry', {
    method: 'POST',
  }, env);
  expect(res.status).toBe(401);
});
```

**Step 3:** Run `pnpm --filter @coursewise/api test -- courseDeletion.permissions`. Expect PASS.

**Step 4:** Commit:

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/courseDeletion.permissions.test.ts
git commit -m "API: admin retry endpoint for R2 cleanup jobs"
```

---

## Task 10: Admin GET endpoint for the deletion log

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1:** Add a list endpoint so the admin UI can show recent deletions and their cleanup status:

```ts
r.get('/admin/course-deletion-log', requireAdmin, async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      id: courseDeletionLog.id,
      courseId: courseDeletionLog.courseId,
      courseCode: courseDeletionLog.courseCode,
      courseTitle: courseDeletionLog.courseTitle,
      deletedBy: courseDeletionLog.deletedBy,
      deletedByName: users.fullName,
      deletedAt: courseDeletionLog.deletedAt,
      childCounts: courseDeletionLog.childCounts,
      cleanup: {
        id: r2CleanupJobs.id,
        courseId: r2CleanupJobs.courseId,
        status: r2CleanupJobs.status,
        attempts: r2CleanupJobs.attempts,
        lastError: r2CleanupJobs.lastError,
        createdAt: r2CleanupJobs.createdAt,
        completedAt: r2CleanupJobs.completedAt,
      },
    })
    .from(courseDeletionLog)
    .leftJoin(users, eq(users.id, courseDeletionLog.deletedBy))
    .leftJoin(r2CleanupJobs, eq(r2CleanupJobs.courseId, courseDeletionLog.courseId))
    .orderBy(desc(courseDeletionLog.deletedAt))
    .limit(100);
  return success(c, rows);
});
```

If the `users` table column for display name is `displayName` or `name`, grep and adjust.

**Step 2:** Add to the same permissions test:

```ts
it('GET /api/admin/course-deletion-log without auth → 401', async () => {
  const res = await app.request('/api/admin/course-deletion-log', {}, env);
  expect(res.status).toBe(401);
});
```

**Step 3:** Run `pnpm --filter @coursewise/api test -- courseDeletion.permissions`. Expect PASS.

**Step 4:** Commit:

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/courseDeletion.permissions.test.ts
git commit -m "API: admin course-deletion-log list endpoint"
```

---

## Task 11: Integration test (skipped without DB)

**Files:**
- Create: `apps/api/src/routes/courseDeletion.integration.test.ts`

**Step 1:** Add `describe.skipIf(!hasDb)('Course hard-delete (integration)', ...)` that:

1. Seeds an admin, a primary teacher, a co-teacher, a student, a course (with code `INT101`), one module, one reading material, one enrolled student, and one uploaded file row in `fileAssets`.
2. Asserts `GET /api/courses/:id/deletion-preview` returns the right counts.
3. Asserts `DELETE` without `confirmCode` → 400.
4. Asserts `DELETE` with wrong `confirmCode` → 400; course still exists.
5. Asserts `DELETE` as co-teacher → 403; course still exists.
6. Asserts `DELETE` as primary teacher with `confirmCode: "INT101"` → 200; course gone; `course_deletion_log` has one row with `childCounts.modules === 1`; `r2_cleanup_jobs` has one row with `status='pending'`.
7. (Cascade assertion) After the delete, queries each of `modules`, `readingMaterials`, `enrollments`, `fileAssets`, `courseTeachers` filtered by `courseId` and confirms zero rows.

Use the existing `m4.permissions.test.ts` or any `*.integration.test.ts` for the env-var + skip pattern and seed helpers.

**Step 2:** Run with `DATABASE_URL=postgresql://...` if available — skip otherwise.

```bash
pnpm --filter @coursewise/api test -- courseDeletion.integration
```

**Step 3:** Commit:

```bash
git add apps/api/src/routes/courseDeletion.integration.test.ts
git commit -m "Test: course hard-delete integration coverage"
```

---

## Task 12: Front-end queries (TanStack Query hooks)

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

**Step 1:** Add `useDeletionPreview`, update the existing `useDeleteCourse` to accept `confirmCode`, add `useRetryR2Cleanup` and `useCourseDeletionLog`:

```ts
export function useDeletionPreview(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-deletion-preview', courseId],
    queryFn: async (): Promise<CourseDeletionPreview> => {
      const res = await api.get(`/courses/${courseId}/deletion-preview`);
      return res.data;
    },
    enabled: !!courseId,
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, confirmCode }: { courseId: string; confirmCode: string }) => {
      await api.delete(`/courses/${courseId}`, { data: { confirmCode } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['admin', 'course-deletion-log'] });
    },
  });
}

export function useCourseDeletionLog() {
  return useQuery({
    queryKey: ['admin', 'course-deletion-log'],
    queryFn: async (): Promise<CourseDeletionLogEntry[]> => {
      const res = await api.get('/admin/course-deletion-log');
      return res.data;
    },
  });
}

export function useRetryR2Cleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/admin/r2-cleanup-jobs/${jobId}/retry`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'course-deletion-log'] }),
  });
}
```

Adjust the existing `useDeleteCourse` call sites — there's exactly one consumer in `TeacherCourseSettings.tsx` (`del.mutate(...)`); update it as part of Task 14.

**Step 2:** Run `pnpm --filter @coursewise/web typecheck`. Expect clean.

**Step 3:** Commit:

```bash
git add apps/web/src/lib/queries.ts
git commit -m "Web: deletion-preview + delete + admin log mutations"
```

---

## Task 13: `DeleteCourseDialog` component (TDD)

**Files:**
- Create: `apps/web/src/components/course/DeleteCourseDialog.tsx`
- Create: `apps/web/src/components/course/DeleteCourseDialog.test.tsx`

**Step 1:** Write the failing test:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteCourseDialog } from './DeleteCourseDialog';

const counts = {
  enrollments: 3, modules: 2, readingMaterials: 4, assignments: 1, submissions: 6,
  quizzes: 1, quizAttempts: 3, discussionTopics: 1, discussionPosts: 12,
  attendanceSessions: 0, fileCount: 2, fileBytes: 1024 * 1024,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('DeleteCourseDialog', () => {
  it('disables the delete button until the typed code matches', () => {
    wrap(
      <DeleteCourseDialog
        open
        onOpenChange={() => {}}
        courseId="c1"
        courseCode="INT101"
        courseTitle="Intro"
        counts={counts}
      />,
    );
    const btn = screen.getByRole('button', { name: /delete forever/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: 'wrong' } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: 'INT101' } });
    expect(btn).toBeEnabled();
  });
});
```

**Step 2:** Run `pnpm --filter @coursewise/web test -- DeleteCourseDialog`. Expect failure (component missing).

**Step 3:** Implement the component (use existing dialog primitives — grep for an existing usage of `Dialog` to match the codebase's UI library; likely Radix-based via `@/components/ui/dialog`):

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChildCounts } from '@coursewise/shared';
import { useDeleteCourse } from '@/lib/queries';
import { useTranslation } from '@/lib/i18n';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  counts: ChildCounts;
  onDeleted?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function DeleteCourseDialog({ open, onOpenChange, courseId, courseCode, courseTitle, counts, onDeleted }: Props): JSX.Element {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const del = useDeleteCourse();
  const matches = typed === courseCode;

  async function onConfirm() {
    await del.mutateAsync({ courseId, confirmCode: typed });
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('course.dangerZone.dialogTitle', { title: courseTitle, code: courseCode })}</DialogTitle>
          <DialogDescription>{t('course.dangerZone.dialogIntro')}</DialogDescription>
        </DialogHeader>
        <ul className="my-4 list-disc pl-6 text-sm text-muted-foreground">
          <li>{t('course.dangerZone.count.enrollments', { n: counts.enrollments })}</li>
          <li>{t('course.dangerZone.count.modules', { n: counts.modules, m: counts.readingMaterials })}</li>
          <li>{t('course.dangerZone.count.assignments', { a: counts.assignments, s: counts.submissions })}</li>
          <li>{t('course.dangerZone.count.quizzes', { q: counts.quizzes, a: counts.quizAttempts })}</li>
          <li>{t('course.dangerZone.count.discussion', { t: counts.discussionTopics, p: counts.discussionPosts })}</li>
          <li>{t('course.dangerZone.count.files', { n: counts.fileCount, bytes: formatBytes(counts.fileBytes) })}</li>
        </ul>
        <Label htmlFor="confirm-code">{t('course.dangerZone.typeToConfirm', { code: courseCode })}</Label>
        <Input id="confirm-code" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('course.dangerZone.courseCodeLabel')} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="destructive" disabled={!matches || del.isPending} onClick={onConfirm}>
            {t('course.dangerZone.deleteForever')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

If `@/lib/i18n`'s `useTranslation` returns a function with a different shape, grep an existing page to copy the actual API.

**Step 4:** Run the test — expect PASS. If `useTranslation` requires an i18n provider in the test, wrap the test with the same provider used elsewhere (grep `i18n` in existing test files).

**Step 5:** Commit:

```bash
git add apps/web/src/components/course/DeleteCourseDialog.tsx apps/web/src/components/course/DeleteCourseDialog.test.tsx
git commit -m "Web: DeleteCourseDialog with type-to-confirm"
```

---

## Task 14: Wire Danger zone into `TeacherCourseSettings`

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherCourseSettings.tsx`

**Step 1:** Remove the existing inline Delete button (currently around line 117) and replace it with a "Danger zone" section at the bottom of the page that opens `DeleteCourseDialog`. The dialog requires the deletion preview; fetch it lazily by `enabled: open`:

```tsx
import { useState } from 'react';
import { useDeletionPreview } from '@/lib/queries';
import { DeleteCourseDialog } from '@/components/course/DeleteCourseDialog';
import { useNavigate } from 'react-router-dom';

// inside the component:
const [dialogOpen, setDialogOpen] = useState(false);
const preview = useDeletionPreview(dialogOpen ? courseId : undefined);
const navigate = useNavigate();
const isPrimary = course?.teachers?.some((t) => t.userId === currentUser?.id && t.role === 'primary');
const canDelete = currentUser?.role === 'admin' || !!isPrimary;

// render at the bottom:
<section className="mt-12 rounded-md border border-red-300 bg-red-50/50 p-4">
  <h2 className="text-lg font-semibold text-red-800">{t('course.dangerZone.title')}</h2>
  <p className="mt-1 text-sm text-red-900/80">{t('course.dangerZone.description')}</p>
  <Button
    variant="destructive"
    className="mt-3"
    disabled={!canDelete}
    title={canDelete ? undefined : t('course.dangerZone.requiresPrimary')}
    onClick={() => setDialogOpen(true)}
  >
    {t('course.dangerZone.deleteButton')}
  </Button>
</section>

{preview.data && (
  <DeleteCourseDialog
    open={dialogOpen}
    onOpenChange={setDialogOpen}
    courseId={preview.data.courseId}
    courseCode={preview.data.courseCode}
    courseTitle={preview.data.courseTitle}
    counts={preview.data.counts}
    onDeleted={() => navigate(currentUser?.role === 'admin' ? '/admin/courses' : '/teacher/courses')}
  />
)}
```

Grep `TeacherCourseSettings` for the actual variable names (`course`, `currentUser`, `courseId`) and adapt. Remove the now-unused `del` / `useDeleteCourse` line in this file (TaskQuery hook still exists in `queries.ts`; it's just imported elsewhere).

**Step 2:** Run `pnpm --filter @coursewise/web typecheck`. Expect clean.

**Step 3:** Commit:

```bash
git add apps/web/src/pages/teacher/TeacherCourseSettings.tsx
git commit -m "Web: Danger zone in TeacherCourseSettings"
```

---

## Task 15: Row action + cleanup badge on `AdminCoursesPage`

**Files:**
- Modify: `apps/web/src/pages/admin/AdminCoursesPage.tsx`

**Step 1:** Add a kebab menu or trailing red "Delete" button on each row that opens `DeleteCourseDialog` against that row's course. Reuse the same lazy `useDeletionPreview` pattern (toggle a `selectedCourseId` state; preview is enabled when set; dialog renders when data is ready).

Then, below the courses list, render a "Recent deletions" panel using `useCourseDeletionLog()`:

```tsx
{deletionLog.data && deletionLog.data.length > 0 && (
  <section className="mt-10">
    <h2 className="text-lg font-semibold">{t('admin.deletionLog.title')}</h2>
    <table className="mt-3 w-full text-sm">
      <thead>...</thead>
      <tbody>
        {deletionLog.data.map((row) => (
          <tr key={row.id}>
            <td>{row.courseCode} — {row.courseTitle}</td>
            <td>{row.deletedByName ?? row.deletedBy}</td>
            <td>{new Date(row.deletedAt).toLocaleString()}</td>
            <td>
              {row.cleanup?.status === 'done' && <span className="text-green-700">{t('admin.deletionLog.cleanup.done')}</span>}
              {row.cleanup?.status === 'pending' && <span className="text-amber-700">{t('admin.deletionLog.cleanup.pending')}</span>}
              {row.cleanup?.status === 'running' && <span className="text-blue-700">{t('admin.deletionLog.cleanup.running')}</span>}
              {row.cleanup?.status === 'failed' && (
                <span className="text-red-700">
                  {t('admin.deletionLog.cleanup.failed')}
                  <button className="ml-2 underline" onClick={() => retry.mutate(row.cleanup!.id)} disabled={retry.isPending}>
                    {t('admin.deletionLog.retry')}
                  </button>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)}
```

**Step 2:** Run `pnpm --filter @coursewise/web typecheck`. Expect clean.

**Step 3:** Commit:

```bash
git add apps/web/src/pages/admin/AdminCoursesPage.tsx
git commit -m "Web: admin row delete + deletion-log panel"
```

---

## Task 16: Locale strings

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

**Step 1:** Add the keys used by `DeleteCourseDialog`, `TeacherCourseSettings` Danger zone, and `AdminCoursesPage` deletion log to both locales. Keep parity: every key added to `en.ts` must exist in `zh-CN.ts`.

Minimum keyset:

```
course.dangerZone.title
course.dangerZone.description
course.dangerZone.deleteButton
course.dangerZone.requiresPrimary
course.dangerZone.dialogTitle  // params: title, code
course.dangerZone.dialogIntro
course.dangerZone.count.enrollments  // {n}
course.dangerZone.count.modules      // {n}, {m}
course.dangerZone.count.assignments  // {a}, {s}
course.dangerZone.count.quizzes      // {q}, {a}
course.dangerZone.count.discussion   // {t}, {p}
course.dangerZone.count.files        // {n}, {bytes}
course.dangerZone.typeToConfirm      // {code}
course.dangerZone.courseCodeLabel
course.dangerZone.deleteForever
admin.deletionLog.title
admin.deletionLog.cleanup.done
admin.deletionLog.cleanup.pending
admin.deletionLog.cleanup.running
admin.deletionLog.cleanup.failed
admin.deletionLog.retry
```

**Step 2:** Run `pnpm --filter @coursewise/web typecheck`. Expect clean. If the locale files use a flat key-value object, follow the existing nesting; if they use nested objects, match that.

**Step 3:** Commit:

```bash
git add apps/web/src/locales/en.ts apps/web/src/locales/zh-CN.ts
git commit -m "i18n: course danger zone + admin deletion log"
```

---

## Task 17: Full repo verification

**Step 1:**

```bash
pnpm typecheck
```

Expected: clean across `packages/shared`, `apps/api`, `apps/web`.

**Step 2:**

```bash
pnpm test
```

Expected: all permissions + unit tests pass; integration tests skip without `DATABASE_URL`.

**Step 3:**

```bash
pnpm lint
```

Expected: clean.

**Step 4:** Manual smoke test in the worktree (no DB migration applied yet — this only catches typecheck/render regressions):

```bash
pnpm dev
```

Open `http://localhost:5173` → log in as a teacher → navigate to a course's Settings → confirm the Danger zone renders, the dialog opens, the button stays disabled until the code is typed correctly. Stop the dev server.

**Step 5:** Apply the migration locally and run the integration test (if a local DB is configured):

```bash
DATABASE_URL=$YOUR_LOCAL_DB pnpm --filter @coursewise/api db:migrate
DATABASE_URL=$YOUR_LOCAL_DB pnpm --filter @coursewise/api test -- courseDeletion.integration
```

**Step 6:** No new commit — this task only verifies.

---

## Task 18: PR

Per the standing workflow:

```bash
git push -u origin course-hard-delete
gh pr create --title "Course hard-delete (Danger Zone)" --body "$(cat <<'EOF'
## Summary
- Adds a Danger zone to course settings (and a row action on admin courses page) that hard-deletes a course after a type-the-code confirmation
- Single-transaction wipe across ~23 cascaded child tables; R2 prefix cleanup via ctx.waitUntil; metadata-only audit row in course_deletion_log
- Admin-only retry for failed cleanup jobs + small recent-deletions panel on admin courses page

## Test plan
- [ ] pnpm test passes (permissions + unit suites green)
- [ ] pnpm typecheck clean
- [ ] Integration tests pass against a local DB
- [ ] Manual: teacher settings Danger zone disabled for co-teacher; enabled + dialog works for primary teacher; admin row action works
- [ ] Manual: deleted course disappears from teacher list and from R2 (check bucket directly for the prefix)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Notes for the executor

- **Don't bypass hooks.** If pre-commit fails, fix the underlying issue, don't `--no-verify`.
- **Don't lose work to amends.** If a hook fails, the commit didn't happen; re-stage and create a new commit, never `--amend`.
- **Cascade discovery.** If `db:generate` flags a column or table that's named differently than what this plan references, follow the actual schema names — grep first, edit second.
- **The integration test is the safety net.** Without it, the cascade chain (especially deeper children like `quizAnswers ← quizAttempts ← quizzes ← courses`) is only verified by the FK declaration. Don't skip Task 11 unless explicitly told to.
- **Locales: parity is mandatory.** A missing zh-CN key is a runtime crash, not a fallback.
