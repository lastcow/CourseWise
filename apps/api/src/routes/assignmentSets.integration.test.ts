/**
 * Assignment sets — end-to-end integration.
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one.
 *
 * Covers the CRUD surface, membership (assignment.setId clears groupId), the
 * ON DELETE SET NULL cascade to members, and the end-to-end best-of roll-up:
 * a set of three graded assignments contributes a single best-of score to its
 * category via the recalculate endpoint.
 *
 * Per-test isolation mirrors assignmentGroups.integration.test.ts.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  assignmentGroups,
  assignmentSets,
  assignments,
  assignmentSubmissions,
  courseTeachers,
  courses,
  enrollments,
  finalGrades,
  gradingPolicies,
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

const COURSE_CODE = 'INT-AS-101';
const COURSE_TITLE = 'Integration Assignment Sets 101';

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
  studentId: string;
}

async function seed(): Promise<SeedResult> {
  const db = createDb(env.DATABASE_URL);
  const teacherId = await getUserIdFromMe(await login(TEACHER_EMAIL, TEACHER_PASSWORD));
  const studentId = await getUserIdFromMe(await login(STUDENT1_EMAIL, STUDENT1_PASSWORD));

  const courseInsert = await db
    .insert(courses)
    .values({ code: COURSE_CODE, title: COURSE_TITLE, status: 'active' })
    .returning({ id: courses.id });
  const courseId = courseInsert[0]!.id;

  await db.insert(courseTeachers).values({ courseId, teacherId, role: 'primary' });
  await db.insert(enrollments).values({ courseId, studentId, status: 'enrolled' });
  await db.insert(gradingPolicies).values({ courseId, weightAttendance: 0, version: 1 });

  return { courseId, studentId };
}

async function cleanFixtures() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  await db.delete(courses).where(eq(courses.code, COURSE_CODE));
}

describe.skipIf(!hasDb)('Assignment sets (integration, requires DATABASE_URL)', () => {
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

  it('CRUD smoke — create (with rule), read, update rule, delete', async () => {
    const courseId = seedData.courseId;

    const created = await call<{ id: string; name: string; scoringRule: string }>(
      `/api/courses/${courseId}/assignment-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'Lab Set', scoringRule: 'highest' }) },
      teacherToken,
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.scoringRule).toBe('highest');
    const setId = created.body.data!.id;

    const list = await call<Array<{ id: string; memberCount: number }>>(
      `/api/courses/${courseId}/assignment-sets`,
      {},
      teacherToken,
    );
    expect(list.body.data?.some((s) => s.id === setId)).toBe(true);

    const patched = await call<{ scoringRule: string }>(
      `/api/courses/${courseId}/assignment-sets/${setId}`,
      { method: 'PATCH', body: JSON.stringify({ scoringRule: 'average' }) },
      teacherToken,
    );
    expect(patched.body.data?.scoringRule).toBe('average');

    const deleted = await call<{ id: string; orphanedItemCount: number }>(
      `/api/courses/${courseId}/assignment-sets/${setId}`,
      { method: 'DELETE' },
      teacherToken,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.orphanedItemCount).toBe(0);
  });

  it('uniqueness — duplicate name (case-insensitive) → 409', async () => {
    const courseId = seedData.courseId;
    const first = await call(
      `/api/courses/${courseId}/assignment-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'Labs' }) },
      teacherToken,
    );
    expect(first.status).toBe(201);
    const dup = await call(
      `/api/courses/${courseId}/assignment-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'labs' }) },
      teacherToken,
    );
    expect(dup.status).toBe(409);
  });

  it('assigning an assignment to a set clears its direct groupId', async () => {
    const courseId = seedData.courseId;
    const db = createDb(env.DATABASE_URL);

    const [group] = await db
      .insert(assignmentGroups)
      .values({ courseId, name: 'Labs', weight: 100, position: 0 })
      .returning({ id: assignmentGroups.id });
    const [set] = await db
      .insert(assignmentSets)
      .values({ courseId, groupId: group!.id, name: 'Lab Set', scoringRule: 'highest', position: 0 })
      .returning({ id: assignmentSets.id });
    const [a] = await db
      .insert(assignments)
      .values({ courseId, groupId: group!.id, title: 'Lab1', maxScore: '100.00', status: 'published' })
      .returning({ id: assignments.id });

    const res = await call(
      `/api/assignments/${a!.id}`,
      { method: 'PATCH', body: JSON.stringify({ setId: set!.id }) },
      teacherToken,
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select({ setId: assignments.setId, groupId: assignments.groupId })
      .from(assignments)
      .where(eq(assignments.id, a!.id));
    expect(row?.setId).toBe(set!.id);
    expect(row?.groupId).toBeNull();
  });

  it('best-of roll-up — a set contributes its highest member, not the average', async () => {
    const courseId = seedData.courseId;
    const studentId = seedData.studentId;
    const db = createDb(env.DATABASE_URL);

    // One category (weight 100) holding a single best-of set of 3 assignments.
    const [group] = await db
      .insert(assignmentGroups)
      .values({ courseId, name: 'Labs', weight: 100, position: 0 })
      .returning({ id: assignmentGroups.id });
    const [set] = await db
      .insert(assignmentSets)
      .values({ courseId, groupId: group!.id, name: 'Lab Set', scoringRule: 'highest', position: 0 })
      .returning({ id: assignmentSets.id });

    const scores = ['85.00', '92.00', '78.00'];
    for (let i = 0; i < scores.length; i++) {
      const [a] = await db
        .insert(assignments)
        .values({
          courseId,
          setId: set!.id,
          title: `Lab${i + 1}`,
          maxScore: '100.00',
          status: 'published',
        })
        .returning({ id: assignments.id });
      await db.insert(assignmentSubmissions).values({
        assignmentId: a!.id,
        studentId,
        status: 'graded',
        score: scores[i],
      });
    }

    const recalc = await call<{ updated: number }>(
      `/api/courses/${courseId}/final-grades/recalculate`,
      { method: 'POST' },
      teacherToken,
    );
    expect(recalc.status, JSON.stringify(recalc.body)).toBe(200);

    const [row] = await db
      .select()
      .from(finalGrades)
      .where(and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, studentId)));
    const score = row?.score !== null && row?.score !== undefined ? Number(row.score) : null;
    // best-of(85,92,78) = 92, single category at weight 100 → final 92 (NOT 85 average).
    expect(score).toBeCloseTo(92, 5);
  });
});
