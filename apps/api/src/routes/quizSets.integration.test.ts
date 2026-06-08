/**
 * Quiz sets — end-to-end integration.
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one.
 *
 * Covers the CRUD surface, case-insensitive name uniqueness, membership
 * (quiz.setId clears its direct groupId), the ON DELETE SET NULL orphaning of
 * members, and the end-to-end roll-up: a set of two graded quizzes (with
 * different maxScores) contributes a single best-of / average score to its
 * category via the recalculate endpoint.
 *
 * Per-test isolation mirrors assignmentSets.integration.test.ts.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  assignmentGroups,
  courseTeachers,
  courses,
  enrollments,
  finalGrades,
  gradingPolicies,
  quizAttempts,
  quizSets,
  quizzes,
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

const COURSE_CODE = 'INT-QS-101';
const COURSE_TITLE = 'Integration Quiz Sets 101';

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

describe.skipIf(!hasDb)('Quiz sets (integration, requires DATABASE_URL)', () => {
  let seedData: SeedResult;
  let teacherToken: string;

  beforeEach(async () => {
    await cleanFixtures();
    teacherToken = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
    seedData = await seed();
  }, 30000);

  afterAll(async () => {
    await cleanFixtures();
  }, 30000);

  it('CRUD smoke — create (with rule), read, update rule, delete', async () => {
    const courseId = seedData.courseId;

    const created = await call<{ id: string; name: string; scoringRule: string }>(
      `/api/courses/${courseId}/quiz-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'Weekly', scoringRule: 'highest' }) },
      teacherToken,
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.scoringRule).toBe('highest');
    const setId = created.body.data!.id;

    const list = await call<Array<{ id: string; memberCount: number }>>(
      `/api/courses/${courseId}/quiz-sets`,
      {},
      teacherToken,
    );
    expect(list.body.data?.some((s) => s.id === setId)).toBe(true);
    expect(list.body.data?.find((s) => s.id === setId)?.memberCount).toBe(0);

    const patched = await call<{ scoringRule: string }>(
      `/api/courses/${courseId}/quiz-sets/${setId}`,
      { method: 'PATCH', body: JSON.stringify({ scoringRule: 'average' }) },
      teacherToken,
    );
    expect(patched.body.data?.scoringRule).toBe('average');

    const deleted = await call<{ id: string; orphanedItemCount: number }>(
      `/api/courses/${courseId}/quiz-sets/${setId}`,
      { method: 'DELETE' },
      teacherToken,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.orphanedItemCount).toBe(0);
  }, 30000);

  it('uniqueness — duplicate name (case-insensitive) → 409', async () => {
    const courseId = seedData.courseId;
    const first = await call(
      `/api/courses/${courseId}/quiz-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'Weekly' }) },
      teacherToken,
    );
    expect(first.status).toBe(201);
    const dup = await call(
      `/api/courses/${courseId}/quiz-sets`,
      { method: 'POST', body: JSON.stringify({ name: 'weekly' }) },
      teacherToken,
    );
    expect(dup.status).toBe(409);
  }, 30000);

  it('assigning a quiz to a set clears its direct groupId; delete orphans the member', async () => {
    const courseId = seedData.courseId;
    const db = createDb(env.DATABASE_URL);

    const [group] = await db
      .insert(assignmentGroups)
      .values({ courseId, name: 'Quizzes', weight: 100, position: 0 })
      .returning({ id: assignmentGroups.id });
    const [set] = await db
      .insert(quizSets)
      .values({ courseId, groupId: group!.id, name: 'Weekly', scoringRule: 'highest', position: 0 })
      .returning({ id: quizSets.id });
    const [q] = await db
      .insert(quizzes)
      .values({ courseId, groupId: group!.id, title: 'Week 1', maxScore: '10.00', status: 'published' })
      .returning({ id: quizzes.id });

    const res = await call(
      `/api/quizzes/${q!.id}`,
      { method: 'PATCH', body: JSON.stringify({ setId: set!.id }) },
      teacherToken,
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select({ setId: quizzes.setId, groupId: quizzes.groupId })
      .from(quizzes)
      .where(eq(quizzes.id, q!.id));
    expect(row?.setId).toBe(set!.id);
    expect(row?.groupId).toBeNull();

    // memberCount reflects the assignment.
    const list = await call<Array<{ id: string; memberCount: number }>>(
      `/api/courses/${courseId}/quiz-sets`,
      {},
      teacherToken,
    );
    expect(list.body.data?.find((s) => s.id === set!.id)?.memberCount).toBe(1);

    // Deleting the set orphans the quiz (set_id → null), reporting the count.
    const deleted = await call<{ orphanedItemCount: number }>(
      `/api/courses/${courseId}/quiz-sets/${set!.id}`,
      { method: 'DELETE' },
      teacherToken,
    );
    expect(deleted.body.data?.orphanedItemCount).toBe(1);
    const [after] = await db
      .select({ setId: quizzes.setId })
      .from(quizzes)
      .where(eq(quizzes.id, q!.id));
    expect(after?.setId).toBeNull();
  }, 30000);

  it('roll-up — a set contributes best-of, then average, of its members (percent-based)', async () => {
    const courseId = seedData.courseId;
    const studentId = seedData.studentId;
    const db = createDb(env.DATABASE_URL);

    // One category (weight 100) holding a single set of two quizzes with
    // different maxScores → roll-up must be on percentages.
    const [group] = await db
      .insert(assignmentGroups)
      .values({ courseId, name: 'Quizzes', weight: 100, position: 0 })
      .returning({ id: assignmentGroups.id });
    const [set] = await db
      .insert(quizSets)
      .values({ courseId, groupId: group!.id, name: 'Weekly', scoringRule: 'highest', position: 0 })
      .returning({ id: quizSets.id });

    // Quiz A: 6/10 = 60%. Quiz B: 18/20 = 90%.
    const members: Array<{ max: string; score: string }> = [
      { max: '10.00', score: '6.00' },
      { max: '20.00', score: '18.00' },
    ];
    for (let i = 0; i < members.length; i++) {
      const [q] = await db
        .insert(quizzes)
        .values({
          courseId,
          setId: set!.id,
          title: `Week ${i + 1}`,
          maxScore: members[i]!.max,
          status: 'published',
        })
        .returning({ id: quizzes.id });
      await db.insert(quizAttempts).values({
        quizId: q!.id,
        studentId,
        status: 'submitted',
        score: members[i]!.score,
        maxScore: members[i]!.max,
        submittedAt: new Date().toISOString(),
      });
    }

    const recalc1 = await call<{ updated: number }>(
      `/api/courses/${courseId}/final-grades/recalculate`,
      { method: 'POST' },
      teacherToken,
    );
    expect(recalc1.status, JSON.stringify(recalc1.body)).toBe(200);

    const readScore = async (): Promise<number | null> => {
      const [row] = await db
        .select()
        .from(finalGrades)
        .where(and(eq(finalGrades.courseId, courseId), eq(finalGrades.studentId, studentId)));
      return row?.score !== null && row?.score !== undefined ? Number(row.score) : null;
    };

    // best-of(60%, 90%) = 90, single category at weight 100 → final 90.
    expect(await readScore()).toBeCloseTo(90, 5);

    // Switch the rule to average and recompute: mean(60%, 90%) = 75.
    const patched = await call(
      `/api/courses/${courseId}/quiz-sets/${set!.id}`,
      { method: 'PATCH', body: JSON.stringify({ scoringRule: 'average' }) },
      teacherToken,
    );
    expect(patched.status).toBe(200);
    const recalc2 = await call(
      `/api/courses/${courseId}/final-grades/recalculate`,
      { method: 'POST' },
      teacherToken,
    );
    expect(recalc2.status).toBe(200);
    expect(await readScore()).toBeCloseTo(75, 5);
  }, 60000);
});
