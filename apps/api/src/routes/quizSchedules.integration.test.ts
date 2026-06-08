/**
 * Quiz tester schedules (staggered / waved availability) — end-to-end.
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one. Seeded users (teacher@, student1-3@)
 * come from `pnpm db:seed`.
 *
 * Covers: backward-compat (no schedules), gating (unassigned blocked), the
 * dynamic remainder wave, per-wave window override flowing into attempt expiry,
 * the per-wave maxAttempts override, mutual-exclusivity/move, the
 * one-remainder-per-quiz rule, and student-forbidden management.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  courseTeachers,
  courses,
  enrollments,
  quizAttempts,
  quizQuestions,
  quizScheduleMembers,
  quizSchedules,
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
const TEACHER = { email: 'teacher@example.com', password: 'Teacher123!' };
const S1 = { email: 'student1@example.com', password: 'Student123!' };
const S2 = { email: 'student2@example.com', password: 'Student123!' };
const S3 = { email: 'student3@example.com', password: 'Student123!' };

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

async function userId(token: string): Promise<string> {
  const res = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } }, env);
  const body = (await res.json()) as { data: { user: { id: string } } };
  return body.data.user.id;
}

interface Ids {
  teacherId: string;
  s1: string;
  s2: string;
  s3: string;
}

interface Seed {
  courseId: string;
  quizId: string;
}

async function seed(ids: Ids): Promise<Seed> {
  const db = createDb(env.DATABASE_URL);
  const { teacherId, s1, s2, s3 } = ids;

  const [course] = await db
    .insert(courses)
    .values({ code: COURSE_CODE, title: 'Quiz Schedules 101', status: 'active' })
    .returning({ id: courses.id });
  const courseId = course!.id;
  await db.insert(courseTeachers).values({ courseId, teacherId, role: 'primary' });
  await db.insert(enrollments).values([
    { courseId, studentId: s1, status: 'enrolled' },
    { courseId, studentId: s2, status: 'enrolled' },
    { courseId, studentId: s3, status: 'enrolled' },
  ]);

  // Published quiz whose GLOBAL window is wide open, so the only thing that can
  // block an attempt is a tester schedule.
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const [quiz] = await db
    .insert(quizzes)
    .values({
      courseId,
      title: 'Waved Quiz',
      status: 'published',
      startTime: past,
      endTime: future,
      maxAttempts: 1,
    })
    .returning({ id: quizzes.id });
  const quizId = quiz!.id;
  await db.insert(quizQuestions).values({
    quizId,
    prompt: 'True or false?',
    type: 'true_false',
    options: ['True', 'False'],
    correctAnswers: true,
    points: '1.00',
    position: 0,
  });

  return { courseId, quizId };
}

async function cleanFixtures() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  await db.delete(courses).where(eq(courses.code, COURSE_CODE));
}

async function createWave(
  quizId: string,
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await call<{ id: string }>(
    `/api/quizzes/${quizId}/schedules`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data!.id;
}

async function setMembers(quizId: string, scheduleId: string, token: string, studentIds: string[]) {
  const res = await call(
    `/api/quizzes/${quizId}/schedules/${scheduleId}/members`,
    { method: 'PUT', body: JSON.stringify({ studentIds }) },
    token,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function startAttempt(quizId: string, token: string) {
  return call<{ id: string; expiresAt: string | null; status: string }>(
    `/api/quizzes/${quizId}/attempts`,
    { method: 'POST' },
    token,
  );
}

describe.skipIf(!hasDb)('Quiz tester schedules (integration, requires DATABASE_URL)', () => {
  let ids: Ids;
  let quizId: string;
  let teacher: string;
  let t1: string;
  let t2: string;
  let t3: string;

  // Log in and seed the course/quiz ONCE for the whole suite. Re-logging in or
  // re-seeding per test multiplies round-trips to the remote DB (and trips the
  // auth rate limiter); instead each test resets only the per-quiz wave +
  // attempt state in beforeEach.
  beforeAll(async () => {
    teacher = await login(TEACHER.email, TEACHER.password);
    t1 = await login(S1.email, S1.password);
    t2 = await login(S2.email, S2.password);
    t3 = await login(S3.email, S3.password);
    ids = {
      teacherId: await userId(teacher),
      s1: await userId(t1),
      s2: await userId(t2),
      s3: await userId(t3),
    };
    await cleanFixtures();
    quizId = (await seed(ids)).quizId;
  }, 30000);

  beforeEach(async () => {
    const db = createDb(env.DATABASE_URL);
    await db.delete(quizSchedules).where(eq(quizSchedules.quizId, quizId)); // cascades members
    await db.delete(quizAttempts).where(eq(quizAttempts.quizId, quizId));
  }, 30000);

  afterAll(async () => {
    await cleanFixtures();
  });

  it('backward compat — with no schedules every enrolled student can start', async () => {
    const r = await startAttempt(quizId, t1);
    expect(r.status).toBe(201);
  }, 30000);

  it('gating — a student in no wave (and no remainder) is blocked', async () => {
    const waveA = await createWave(quizId, teacher, { name: 'Wave A' });
    await setMembers(quizId, waveA, teacher, [ids.s2]);

    const blocked = await startAttempt(quizId, t1);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code).toBe('FORBIDDEN');

    const allowed = await startAttempt(quizId, t2);
    expect(allowed.status).toBe(201);
  }, 30000);

  it('dynamic remainder — absorbs every student not in an explicit wave', async () => {
    const waveA = await createWave(quizId, teacher, { name: 'Wave A' });
    await setMembers(quizId, waveA, teacher, [ids.s2]);
    await createWave(quizId, teacher, { name: 'The rest', isRemainder: true });

    // s1 and s3 are not in wave A → resolve to the remainder → can start.
    expect((await startAttempt(quizId, t1)).status).toBe(201);
    expect((await startAttempt(quizId, t3)).status).toBe(201);
  }, 30000);

  it('per-wave untilDate flows into the attempt expiry (min-of)', async () => {
    const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const wave = await createWave(quizId, teacher, { name: 'Wave A', untilDate: until });
    await setMembers(quizId, wave, teacher, [ids.s2]);

    const r = await startAttempt(quizId, t2);
    expect(r.status).toBe(201);
    expect(r.body.data?.expiresAt).toBeTruthy();
    // expiry == min(no time-limit, far endTime, wave untilDate) == untilDate.
    const diff = Math.abs(Date.parse(r.body.data!.expiresAt!) - Date.parse(until));
    expect(diff).toBeLessThan(2000);
  }, 30000);

  it('per-wave maxAttempts override lets a student start a second attempt', async () => {
    const wave = await createWave(quizId, teacher, { name: 'Wave A', maxAttempts: 2 });
    await setMembers(quizId, wave, teacher, [ids.s2]);

    const first = await startAttempt(quizId, t2);
    expect(first.status).toBe(201);
    const submit = await call(
      `/api/quiz-attempts/${first.body.data!.id}/submit`,
      { method: 'POST', body: JSON.stringify({ answers: [] }) },
      t2,
    );
    expect(submit.status).toBe(200);

    // Quiz maxAttempts is 1; the wave override (2) is what allows the second.
    const second = await startAttempt(quizId, t2);
    expect(second.status).toBe(201);
  }, 30000);

  it('mutual exclusivity — moving a student leaves exactly one membership', async () => {
    const a = await createWave(quizId, teacher, { name: 'Wave A' });
    const b = await createWave(quizId, teacher, { name: 'Wave B' });
    await setMembers(quizId, a, teacher, [ids.s2]);
    await setMembers(quizId, b, teacher, [ids.s2]); // move s2 from A to B

    const db = createDb(env.DATABASE_URL);
    const rows = await db
      .select({ scheduleId: quizScheduleMembers.scheduleId })
      .from(quizScheduleMembers)
      .where(eq(quizScheduleMembers.studentId, ids.s2));
    expect(rows.length).toBe(1);
    expect(rows[0]!.scheduleId).toBe(b);

    const list = await call<{
      schedules: Array<{ id: string; members: Array<{ studentId: string }> }>;
    }>(`/api/quizzes/${quizId}/schedules`, {}, teacher);
    const waveA = list.body.data!.schedules.find((x) => x.id === a)!;
    expect(waveA.members.length).toBe(0);
  }, 30000);

  it('one remainder per quiz — a second remainder wave is rejected', async () => {
    await createWave(quizId, teacher, { name: 'The rest', isRemainder: true });
    const dup = await call(
      `/api/quizzes/${quizId}/schedules`,
      { method: 'POST', body: JSON.stringify({ name: 'The rest 2', isRemainder: true }) },
      teacher,
    );
    expect(dup.status).toBe(409);
  }, 30000);

  it('remainder preview counts the unscheduled students', async () => {
    const a = await createWave(quizId, teacher, { name: 'Wave A' });
    await setMembers(quizId, a, teacher, [ids.s2]);
    const list = await call<{ remainderPreview: { count: number } }>(
      `/api/quizzes/${quizId}/schedules`,
      {},
      teacher,
    );
    // s1 + s3 are unscheduled.
    expect(list.body.data?.remainderPreview.count).toBe(2);
  }, 30000);

  it('management is teacher-only — a student cannot create a schedule', async () => {
    const res = await call(
      `/api/quizzes/${quizId}/schedules`,
      { method: 'POST', body: JSON.stringify({ name: 'Nope' }) },
      t1,
    );
    expect(res.status).toBe(403);
  }, 30000);
});
