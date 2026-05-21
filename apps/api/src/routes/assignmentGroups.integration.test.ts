/**
 * Assignment groups — end-to-end integration (Task 8).
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one.
 *
 * Covers the CRUD surface, reorder behaviour, ON DELETE SET NULL cascading
 * to assignment items, and the finalGrade calculation end-to-end (with the
 * "skip empty groups + renormalize weights" algorithm exercised via the
 * recalculate endpoint).
 *
 * Per-test isolation: each test rebuilds the seed in `beforeEach`. The fixed
 * course code `INT-AG-101` means leftover rows from a previous run would
 * collide with the unique index, so `beforeEach` also wipes the fixture up
 * front. The cleanup cascades via FK to assignment_groups, assignments,
 * quizzes, grading_policies, and final_grades.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq, sql } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  assignmentGroups,
  assignments,
  courseTeachers,
  courses,
  enrollments,
  gradingPolicies,
  quizzes,
  assignmentSubmissions,
  finalGrades,
} from '../db/schema';

const hasDb = !!process.env.DATABASE_URL;
const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'integration-secret-integration-secret-12345',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? 'integration-refresh-integration-refresh-12345',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  BCRYPT_ROUNDS: '4',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

const COURSE_CODE = 'INT-AG-101';
const COURSE_TITLE = 'Integration Assignment Groups 101';

const TEACHER_EMAIL = 'teacher@example.com';
const TEACHER_PASSWORD = 'Teacher123!';
const STUDENT1_EMAIL = 'student1@example.com';
const STUDENT1_PASSWORD = 'Student123!';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function login(email: string, password: string): Promise<string> {
  const res = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    env,
  );
  expect(res.status, `login ${email}`).toBe(200);
  const body = (await res.json()) as Envelope<{ accessToken: string }>;
  return body.data!.accessToken;
}

async function call<T = unknown>(
  path: string,
  init: RequestInit = {},
  auth?: string,
): Promise<{ status: number; body: Envelope<T> }> {
  const headers = new Headers(init.headers);
  if (auth) headers.set('authorization', `Bearer ${auth}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await app.request(path, { ...init, headers }, env);
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = { success: false, error: { code: 'NON_JSON', message: 'Non-JSON response' } };
  }
  return { status: res.status, body };
}

async function getUserIdFromMe(token: string): Promise<string> {
  const res = await app.request(
    '/api/auth/me',
    { headers: { authorization: `Bearer ${token}` } },
    env,
  );
  expect(res.status, '/api/auth/me').toBe(200);
  const body = (await res.json()) as { data: { user: { id: string } } };
  return body.data.user.id;
}

interface SeedResult {
  courseId: string;
  teacherId: string;
  studentId: string;
}

/**
 * Build the seed graph required by every test in this suite.
 *
 * Re-uses the standard seeded users (teacher, student1) by looking up their
 * IDs via /api/auth/me. Creates a fresh `INT-AG-101` course attached to the
 * teacher as `'primary'`, enrolls student1, and ensures a grading_policies
 * row exists with weightAttendance=0 (so finalGrade math is purely
 * groups-driven in test 5).
 */
async function seed(): Promise<SeedResult> {
  const db = createDb(env.DATABASE_URL);

  const teacherId = await getUserIdFromMe(await login(TEACHER_EMAIL, TEACHER_PASSWORD));
  const studentId = await getUserIdFromMe(await login(STUDENT1_EMAIL, STUDENT1_PASSWORD));

  const courseInsert = await db
    .insert(courses)
    .values({
      code: COURSE_CODE,
      title: COURSE_TITLE,
      status: 'active',
    })
    .returning({ id: courses.id });
  const courseId = courseInsert[0]!.id;

  await db.insert(courseTeachers).values({
    courseId,
    teacherId,
    role: 'primary',
  });

  await db.insert(enrollments).values({
    courseId,
    studentId,
    status: 'enrolled',
  });

  // Attendance weight 0 so the finalGrade math is fully driven by groups
  // (test 5 relies on this). Other tests don't care about the policy row.
  await db.insert(gradingPolicies).values({
    courseId,
    weightAttendance: 0,
    version: 1,
  });

  return { courseId, teacherId, studentId };
}

/**
 * Wipe any prior `INT-AG-101` course. FK cascades take care of
 * assignment_groups, assignments, quizzes, grading_policies, enrollments,
 * course_teachers, and final_grades for that course.
 */
async function cleanFixtures() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  await db.delete(courses).where(eq(courses.code, COURSE_CODE));
}

describe.skipIf(!hasDb)(
  'Assignment groups (integration, requires DATABASE_URL)',
  () => {
    let seedData: SeedResult;
    let teacherToken: string;

    beforeEach(async () => {
      await cleanFixtures();
      teacherToken = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
      seedData = await seed();
    });

    afterAll(async () => {
      await cleanFixtures();
    });

    it('1. CRUD smoke — create, read, update name + weight, delete', async () => {
      const courseId = seedData.courseId;

      // POST: create "Lab" weight 20.
      const created = await call<{ id: string; name: string; weight: number; position: number }>(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'Lab', weight: 20 }) },
        teacherToken,
      );
      expect(created.status).toBe(201);
      expect(created.body.data?.name).toBe('Lab');
      expect(created.body.data?.weight).toBe(20);
      const groupId = created.body.data!.id;

      // GET: should include "Lab".
      const list1 = await call<Array<{ id: string; name: string; weight: number }>>(
        `/api/courses/${courseId}/assignment-groups`,
        {},
        teacherToken,
      );
      expect(list1.status).toBe(200);
      expect(list1.body.data?.some((g) => g.id === groupId && g.name === 'Lab')).toBe(true);

      // PATCH name → "Laboratory".
      const renamed = await call<{ name: string }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'PATCH', body: JSON.stringify({ name: 'Laboratory' }) },
        teacherToken,
      );
      expect(renamed.status).toBe(200);
      expect(renamed.body.data?.name).toBe('Laboratory');

      // PATCH weight → 25.
      const reweighted = await call<{ weight: number }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'PATCH', body: JSON.stringify({ weight: 25 }) },
        teacherToken,
      );
      expect(reweighted.status).toBe(200);
      expect(reweighted.body.data?.weight).toBe(25);

      // DELETE → { id, orphanedItemCount: 0 }.
      const deleted = await call<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'DELETE' },
        teacherToken,
      );
      expect(deleted.status).toBe(200);
      expect(deleted.body.data?.id).toBe(groupId);
      expect(deleted.body.data?.orphanedItemCount).toBe(0);

      // GET again → the deleted group is gone.
      const list2 = await call<Array<{ id: string }>>(
        `/api/courses/${courseId}/assignment-groups`,
        {},
        teacherToken,
      );
      expect(list2.status).toBe(200);
      expect(list2.body.data?.some((g) => g.id === groupId)).toBe(false);
    });

    it('2. uniqueness — duplicate name (case-insensitive) → 409 CONFLICT', async () => {
      const courseId = seedData.courseId;

      const first = await call(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'Lab', weight: 20 }) },
        teacherToken,
      );
      expect(first.status).toBe(201);

      const dup = await call(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'lab', weight: 10 }) },
        teacherToken,
      );
      expect(dup.status).toBe(409);
      expect(dup.body.error?.code).toBe('CONFLICT');
    });

    it('3. reorder — POST /reorder swaps positions', async () => {
      const courseId = seedData.courseId;

      const a = await call<{ id: string; position: number }>(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'Alpha', weight: 30 }) },
        teacherToken,
      );
      expect(a.status).toBe(201);
      const b = await call<{ id: string; position: number }>(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'Beta', weight: 30 }) },
        teacherToken,
      );
      expect(b.status).toBe(201);

      const aId = a.body.data!.id;
      const bId = b.body.data!.id;
      const aPosBefore = a.body.data!.position;
      const bPosBefore = b.body.data!.position;
      expect(aPosBefore).toBeLessThan(bPosBefore);

      // Reorder with reversed ids: now b should be at the lower position.
      const reorder = await app.request(
        `/api/courses/${courseId}/assignment-groups/reorder`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${teacherToken}`,
          },
          body: JSON.stringify({ orderedIds: [bId, aId] }),
        },
        env,
      );
      expect(reorder.status).toBe(204);

      const list = await call<Array<{ id: string; position: number }>>(
        `/api/courses/${courseId}/assignment-groups`,
        {},
        teacherToken,
      );
      expect(list.status).toBe(200);
      const byId = new Map(list.body.data!.map((g) => [g.id, g.position]));
      expect(byId.get(bId)).toBe(0);
      expect(byId.get(aId)).toBe(1);
    });

    it('4. delete with items — orphanedItemCount reflects setNull cascade', async () => {
      const courseId = seedData.courseId;
      const db = createDb(env.DATABASE_URL);

      const created = await call<{ id: string }>(
        `/api/courses/${courseId}/assignment-groups`,
        { method: 'POST', body: JSON.stringify({ name: 'Homework', weight: 20 }) },
        teacherToken,
      );
      expect(created.status).toBe(201);
      const groupId = created.body.data!.id;

      const assignmentInsert = await db
        .insert(assignments)
        .values({
          courseId,
          groupId,
          title: 'HW1',
          maxScore: '100.00',
          status: 'published',
        })
        .returning({ id: assignments.id });
      const assignmentId = assignmentInsert[0]!.id;

      const deleted = await call<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'DELETE' },
        teacherToken,
      );
      expect(deleted.status).toBe(200);
      expect(deleted.body.data?.orphanedItemCount).toBe(1);

      // Assignment still exists but its group_id is NULL.
      const [row] = await db
        .select({ id: assignments.id, groupId: assignments.groupId })
        .from(assignments)
        .where(eq(assignments.id, assignmentId));
      expect(row?.id).toBe(assignmentId);
      expect(row?.groupId).toBeNull();
    });

    it('5. finalGrade math — weights normalized over groups with data', async () => {
      const courseId = seedData.courseId;
      const studentId = seedData.studentId;
      const db = createDb(env.DATABASE_URL);

      // Seed three groups summing to 100 (required by finalize endpoint).
      const groupRows = await db
        .insert(assignmentGroups)
        .values([
          { courseId, name: 'G1', weight: 40, position: 0 },
          { courseId, name: 'G2', weight: 30, position: 1 },
          { courseId, name: 'G3', weight: 30, position: 2 },
        ])
        .returning({ id: assignmentGroups.id, name: assignmentGroups.name });
      const byName = new Map(groupRows.map((g) => [g.name, g.id]));
      const g1Id = byName.get('G1')!;
      const g2Id = byName.get('G2')!;

      // G1: one assignment 80/100.
      const assignmentInsert = await db
        .insert(assignments)
        .values({
          courseId,
          groupId: g1Id,
          title: 'A1',
          maxScore: '100.00',
          status: 'published',
        })
        .returning({ id: assignments.id });
      const assignmentId = assignmentInsert[0]!.id;
      await db.insert(assignmentSubmissions).values({
        assignmentId,
        studentId,
        status: 'graded',
        score: '80.00',
      });

      // G2: one quiz 60/100 (we read scores from quiz_attempts in the
      // service, so insert a quiz + a submitted attempt with score=60).
      const quizInsert = await db
        .insert(quizzes)
        .values({
          courseId,
          groupId: g2Id,
          title: 'Q1',
          maxScore: '100.00',
          status: 'published',
        })
        .returning({ id: quizzes.id });
      const quizId = quizInsert[0]!.id;
      await db.execute(sql`
        INSERT INTO quiz_attempts (quiz_id, student_id, status, score, max_score, submitted_at)
        VALUES (${quizId}, ${studentId}, 'submitted', 60.00, 100.00, now())
      `);

      // G3: empty (no items).

      // Trigger the recalculate endpoint.
      const recalc = await call<{ updated: number }>(
        `/api/courses/${courseId}/final-grades/recalculate`,
        { method: 'POST' },
        teacherToken,
      );
      expect(recalc.status, JSON.stringify(recalc.body)).toBe(200);
      expect(recalc.body.data?.updated).toBeGreaterThanOrEqual(1);

      // Read the persisted final grade and assert score = (80*40 + 60*30)/70.
      const [row] = await db
        .select()
        .from(finalGrades)
        .where(
          and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, studentId)),
        );
      expect(row).toBeDefined();
      const score = row?.score !== null && row?.score !== undefined ? Number(row.score) : null;
      expect(score).not.toBeNull();
      // (80*40 + 60*30) / 70 = 71.4285714…; rounded to 2dp in persistence → 71.43.
      expect(score!).toBeCloseTo(71.4285714, 1);
    });
  },
);

// Suppress unused-import warnings for helpers reserved for future tests.
void asc;
