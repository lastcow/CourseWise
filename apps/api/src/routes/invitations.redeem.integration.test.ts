/**
 * Invitation-code redemption — end-to-end integration (Task 3).
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one.
 *
 * Covers the redemption surface beyond what the unit/permissions test can
 * see: real Postgres CTE behaviour, idempotency on `enrolled`, dropped→enrolled
 * flip, and the concurrent race-loss guard. The primary correctness gate for
 * CI is still `pnpm typecheck` since the suite skips without a database.
 *
 * Per-test isolation: each test rebuilds the seed in `beforeEach`. The fixed
 * course code `INT-RDM-101` and invitation code `INV-RDM-1234` mean leftover
 * rows from a previous run would collide with the unique indexes, so
 * `beforeEach` also wipes both fixtures up front.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import { courseTeachers, courses, enrollments, invitationCodes } from '../db/schema';

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

const COURSE_CODE = 'INT-RDM-101';
const COURSE_TITLE = 'Integration Redeem 101';
const INVITE_CODE = 'INV-RDM-1234';
const COURSELESS_INVITE_CODE = 'INV-RDM-NOCS';
const MISSING_INVITE_CODE = 'INV-NOPE-9999';

const ADMIN_EMAIL = 'ebiz@chen.me';
const ADMIN_PASSWORD = 'Paradise@0';
const TEACHER_EMAIL = 'teacher@example.com';
const TEACHER_PASSWORD = 'Teacher123!';
const STUDENT1_EMAIL = 'student1@example.com';
const STUDENT1_PASSWORD = 'Student123!';
const STUDENT2_EMAIL = 'student2@example.com';
const STUDENT2_PASSWORD = 'Student123!';

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
  inviteCodeId: string;
  teacherId: string;
  studentId: string;
}

/**
 * Build the seed graph required by every test in this suite.
 *
 * Re-uses the standard seeded users (admin, teacher, student1) by looking up
 * their IDs via /api/auth/me. Creates a fresh `INT-RDM-101` course attached
 * to the teacher as `'primary'`, plus one active `INV-RDM-1234` invitation
 * code with maxUses=2, usedCount=0. Direct Drizzle inserts throughout — no
 * dependence on API surfaces that may evolve.
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

  const inviteInsert = await db
    .insert(invitationCodes)
    .values({
      code: INVITE_CODE,
      courseId,
      maxUses: 2,
      usedCount: 0,
      status: 'active',
    })
    .returning({ id: invitationCodes.id });
  const inviteCodeId = inviteInsert[0]!.id;

  return { courseId, inviteCodeId, teacherId, studentId };
}

/**
 * Wipe any prior `INT-RDM-101` course (its enrollments / courseTeachers / etc
 * cascade via FKs) plus any stranded invitation codes from the test fixture
 * namespace. Each test runs from a clean slate.
 */
async function cleanFixtures() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);

  // Drop the invite codes first — invitationCodes.courseId has ON DELETE CASCADE
  // but we also have a courseless code in the namespace that won't be touched
  // by the course deletion, so explicit cleanup keeps things tidy regardless.
  await db
    .delete(invitationCodes)
    .where(
      sql`lower(${invitationCodes.code}) IN (lower(${INVITE_CODE}), lower(${COURSELESS_INVITE_CODE}))`,
    );

  // Drop the course — cascades hit enrollments + courseTeachers.
  await db.delete(courses).where(eq(courses.code, COURSE_CODE));
}

describe.skipIf(!hasDb)(
  'POST /api/invitation-codes/redeem (integration, requires DATABASE_URL)',
  () => {
    let seedData: SeedResult;
    let adminToken: string;
    let teacherToken: string;
    let studentToken: string;

    beforeEach(async () => {
      await cleanFixtures();
      adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      teacherToken = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
      studentToken = await login(STUDENT1_EMAIL, STUDENT1_PASSWORD);
      seedData = await seed();
    });

    afterAll(async () => {
      await cleanFixtures();
    });

    it('1. valid code, not yet enrolled → 200, enrolls, increments used_count', async () => {
      const res = await call<{
        courseId: string;
        courseCode: string;
        courseTitle: string;
        alreadyEnrolled: boolean;
        enrollmentId?: string;
      }>(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data?.alreadyEnrolled).toBe(false);
      expect(res.body.data?.courseId).toBe(seedData.courseId);
      expect(res.body.data?.courseCode).toBe(COURSE_CODE);
      expect(res.body.data?.courseTitle).toBe(COURSE_TITLE);
      expect(res.body.data?.enrollmentId).toBeDefined();

      const db = createDb(env.DATABASE_URL);
      const enrolled = await db
        .select({ id: enrollments.id, status: enrollments.status })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, seedData.courseId),
            eq(enrollments.studentId, seedData.studentId),
          ),
        );
      expect(enrolled.length).toBe(1);
      expect(enrolled[0]?.status).toBe('enrolled');

      const [codeRow] = await db
        .select({ usedCount: invitationCodes.usedCount })
        .from(invitationCodes)
        .where(eq(invitationCodes.id, seedData.inviteCodeId));
      expect(codeRow?.usedCount).toBe(1);
    });

    it('2. valid code, already enrolled → 200, no-op, used_count unchanged', async () => {
      const db = createDb(env.DATABASE_URL);
      await db.insert(enrollments).values({
        courseId: seedData.courseId,
        studentId: seedData.studentId,
        status: 'enrolled',
      });

      const res = await call<{
        alreadyEnrolled: boolean;
        enrollmentId?: string;
      }>(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data?.alreadyEnrolled).toBe(true);
      expect(res.body.data?.enrollmentId).toBeUndefined();

      const [codeRow] = await db
        .select({ usedCount: invitationCodes.usedCount })
        .from(invitationCodes)
        .where(eq(invitationCodes.id, seedData.inviteCodeId));
      expect(codeRow?.usedCount).toBe(0);

      const enrolled = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, seedData.courseId),
            eq(enrollments.studentId, seedData.studentId),
          ),
        );
      expect(enrolled.length).toBe(1);
    });

    it('3. previously dropped → 200, flips to enrolled, used_count increments', async () => {
      const db = createDb(env.DATABASE_URL);
      await db.insert(enrollments).values({
        courseId: seedData.courseId,
        studentId: seedData.studentId,
        status: 'dropped',
      });

      const res = await call<{ alreadyEnrolled: boolean; enrollmentId?: string }>(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data?.alreadyEnrolled).toBe(false);
      expect(res.body.data?.enrollmentId).toBeDefined();

      const enrolled = await db
        .select({ status: enrollments.status })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, seedData.courseId),
            eq(enrollments.studentId, seedData.studentId),
          ),
        );
      expect(enrolled.length).toBe(1);
      expect(enrolled[0]?.status).toBe('enrolled');

      const [codeRow] = await db
        .select({ usedCount: invitationCodes.usedCount })
        .from(invitationCodes)
        .where(eq(invitationCodes.id, seedData.inviteCodeId));
      expect(codeRow?.usedCount).toBe(1);
    });

    it('4. caller is teacher → 403 with student-account message', async () => {
      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        teacherToken,
      );
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN');
      expect(res.body.error?.message?.toLowerCase()).toContain('student');
    });

    it('5. caller is admin → 403', async () => {
      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        adminToken,
      );
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN');
    });

    it('6. code revoked → 400', async () => {
      const db = createDb(env.DATABASE_URL);
      await db
        .update(invitationCodes)
        .set({ status: 'revoked' })
        .where(eq(invitationCodes.id, seedData.inviteCodeId));

      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_INVITATION');
    });

    it('7. code expired → 400', async () => {
      const db = createDb(env.DATABASE_URL);
      const past = new Date(Date.now() - 60_000).toISOString();
      await db
        .update(invitationCodes)
        .set({ expiresAt: past })
        .where(eq(invitationCodes.id, seedData.inviteCodeId));

      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_INVITATION');
    });

    it('8. code exhausted → 400', async () => {
      const db = createDb(env.DATABASE_URL);
      await db
        .update(invitationCodes)
        .set({ usedCount: 2 })
        .where(eq(invitationCodes.id, seedData.inviteCodeId));

      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_INVITATION');
    });

    it('9. code missing → 404 with not-found message', async () => {
      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: MISSING_INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('NOT_FOUND');
      expect(res.body.error?.message?.toLowerCase()).toContain('not found');
    });

    it('10. course-less code → 400', async () => {
      const db = createDb(env.DATABASE_URL);
      await db.insert(invitationCodes).values({
        code: COURSELESS_INVITE_CODE,
        courseId: null,
        maxUses: 5,
        usedCount: 0,
        status: 'active',
      });

      const res = await call(
        '/api/invitation-codes/redeem',
        { method: 'POST', body: JSON.stringify({ code: COURSELESS_INVITE_CODE }) },
        studentToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_INVITATION');
    });

    it('11. concurrent race — two students, maxUses=1 → exactly one 200, one 400, used_count=1', async () => {
      const db = createDb(env.DATABASE_URL);

      // Lower the cap to 1 so we can observe the race-loss path.
      await db
        .update(invitationCodes)
        .set({ maxUses: 1, usedCount: 0 })
        .where(eq(invitationCodes.id, seedData.inviteCodeId));

      // Resolve a SECOND student so the two concurrent calls really come from
      // different identities (the redeem handler short-circuits per-student
      // via the "already enrolled" check, so a single student firing twice
      // wouldn't exercise the increment race).
      const student1Token = studentToken;
      const student2Token = await login(STUDENT2_EMAIL, STUDENT2_PASSWORD);
      const student2Id = await getUserIdFromMe(student2Token);

      // Defensive: clear any prior enrollments for both students against the
      // freshly-seeded course (cleanFixtures already dropped the course but
      // belt-and-braces).
      await db
        .delete(enrollments)
        .where(
          and(
            eq(enrollments.courseId, seedData.courseId),
            sql`${enrollments.studentId} IN (${seedData.studentId}, ${student2Id})`,
          ),
        );

      const [resA, resB] = await Promise.all([
        call(
          '/api/invitation-codes/redeem',
          { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
          student1Token,
        ),
        call(
          '/api/invitation-codes/redeem',
          { method: 'POST', body: JSON.stringify({ code: INVITE_CODE }) },
          student2Token,
        ),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 400]);

      const [codeRow] = await db
        .select({ usedCount: invitationCodes.usedCount })
        .from(invitationCodes)
        .where(eq(invitationCodes.id, seedData.inviteCodeId));
      expect(codeRow?.usedCount).toBe(1);
    });
  },
);
