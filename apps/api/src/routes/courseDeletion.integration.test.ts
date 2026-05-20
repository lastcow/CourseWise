/**
 * Course hard-delete — end-to-end integration (Task 11).
 *
 * Gated on DATABASE_URL like the other integration tests: skips automatically
 * when no Postgres is configured (typical CI), runs against a real Neon
 * database when DATABASE_URL points at one.
 *
 * Covers the safety net for the cascade FK chain that DELETE FROM courses
 * relies on. A unit test cannot verify Postgres actually enforces the chain
 * (the FK definitions only describe intent); this test confirms the runtime
 * behaviour by seeding child rows and asserting they disappear.
 *
 * Per-test isolation: each test rebuilds the seed in `beforeEach`. The fixed
 * course code `INT101` (required because it doubles as the confirm code) means
 * a leftover row from a previous run would collide with the unique index, so
 * `beforeEach` also wipes any pre-existing `INT101` course and the temporary
 * co-teacher user up front.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  courseDeletionLog,
  courseTeachers,
  courses,
  enrollments,
  fileAssets,
  modules,
  r2CleanupJobs,
  readingMaterials,
  users,
} from '../db/schema';
import { hashPassword } from '../services/password';

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
  // Intentionally no COURSE_FILES binding — the R2 cleanup job will be
  // inserted with status='pending' but the worker won't run. We only assert
  // DB-side state.
};

const COURSE_CODE = 'INT101';
const COURSE_TITLE = 'Integration deletion fixture';
const COTEACHER_EMAIL = 'coteacher-int101@example.test';
const COTEACHER_PASSWORD = 'CoTeacher123!';

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

interface SeedResult {
  courseId: string;
  primaryTeacherId: string;
  coTeacherId: string;
  studentId: string;
  moduleId: string;
  readingMaterialId: string;
  enrollmentId: string;
  fileAssetId: string;
}

/**
 * Build the seed graph required by every test in this suite.
 *
 * We rely on the API to discover the seeded user IDs (admin, teacher, student)
 * so we don't have to duplicate their UUIDs here. The co-teacher is created
 * directly via Drizzle because the existing seed doesn't include a second
 * teacher.
 */
async function seed(adminToken: string): Promise<SeedResult> {
  const db = createDb(env.DATABASE_URL);

  // Discover seeded user IDs by hitting /api/auth/me.
  const primaryTeacherId = await getUserIdFromMe(
    await login('teacher@example.com', 'Teacher123!'),
  );
  const studentId = await getUserIdFromMe(
    await login('student1@example.com', 'Student123!'),
  );

  // Ensure a co-teacher exists. We upsert by email so re-runs are idempotent.
  const existingCo = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${COTEACHER_EMAIL})`)
    .limit(1);
  let coTeacherId: string;
  if (existingCo[0]) {
    coTeacherId = existingCo[0].id;
  } else {
    const passwordHash = await hashPassword(COTEACHER_PASSWORD, 4);
    const inserted = await db
      .insert(users)
      .values({
        email: COTEACHER_EMAIL,
        passwordHash,
        name: 'INT101 Co-teacher',
        role: 'teacher',
      })
      .returning({ id: users.id });
    coTeacherId = inserted[0]!.id;
  }

  // Create the course as the primary teacher so they become its 'primary'
  // courseTeachers row automatically.
  const createRes = await call<{ id: string }>(
    '/api/courses',
    {
      method: 'POST',
      body: JSON.stringify({ code: COURSE_CODE, title: COURSE_TITLE }),
    },
    await login('teacher@example.com', 'Teacher123!'),
  );
  expect(createRes.status, 'create course').toBe(201);
  const courseId = createRes.body.data!.id;

  // Add the co-teacher row directly (no API endpoint for this yet).
  await db.insert(courseTeachers).values({
    courseId,
    teacherId: coTeacherId,
    role: 'co_teacher',
  });

  // One module via API.
  const modRes = await call<{ id: string }>(
    `/api/courses/${courseId}/modules`,
    { method: 'POST', body: JSON.stringify({ title: 'M1' }) },
    adminToken,
  );
  expect(modRes.status, 'create module').toBe(201);
  const moduleId = modRes.body.data!.id;

  // One reading material via API.
  const matRes = await call<{ id: string }>(
    `/api/courses/${courseId}/materials`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Reading 1',
        sourceType: 'manual_text',
        content: 'hello',
        moduleId,
      }),
    },
    adminToken,
  );
  expect(matRes.status, 'create material').toBe(201);
  const readingMaterialId = matRes.body.data!.id;

  // One enrollment via direct DB insert.
  const enrollmentInsert = await db
    .insert(enrollments)
    .values({ courseId, studentId, status: 'enrolled' })
    .returning({ id: enrollments.id });
  const enrollmentId = enrollmentInsert[0]!.id;

  // One file_assets row for the course. Object key follows the canonical
  // courses/<id>/... shape so the R2 cleanup job sees the right prefix.
  const fileInsert = await db
    .insert(fileAssets)
    .values({
      courseId,
      ownerId: primaryTeacherId,
      bucket: 'coursewise-files',
      objectKey: `courses/${courseId}/test/file.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 1024,
      originalFilename: 'file.pdf',
      status: 'ready',
    })
    .returning({ id: fileAssets.id });
  const fileAssetId = fileInsert[0]!.id;

  return {
    courseId,
    primaryTeacherId,
    coTeacherId,
    studentId,
    moduleId,
    readingMaterialId,
    enrollmentId,
    fileAssetId,
  };
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

/**
 * Wipes any prior INT101 course (and its cascaded children) so each test
 * starts from a clean slate. Also clears the deletion-log + r2 cleanup rows
 * for that course id since their FKs don't cascade from courses (the design
 * intentionally retains the audit trail; we shed it manually between tests
 * so assertions like "exactly one row" remain meaningful).
 */
async function cleanCourseFixtures() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  const existing = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.code, COURSE_CODE));
  for (const row of existing) {
    await db.delete(courseDeletionLog).where(eq(courseDeletionLog.courseId, row.id));
    await db.delete(r2CleanupJobs).where(eq(r2CleanupJobs.courseId, row.id));
    // FK cascades will take care of children once the course goes.
    await db.delete(courses).where(eq(courses.id, row.id));
  }
  // Also clean any stranded log / cleanup rows from previous failed runs
  // (when course was already gone but log rows remained tagged by old uuids).
  await db
    .delete(courseDeletionLog)
    .where(eq(courseDeletionLog.courseCode, COURSE_CODE));
}

async function cleanCoTeacher() {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  await db.delete(users).where(sql`lower(${users.email}) = lower(${COTEACHER_EMAIL})`);
}

describe.skipIf(!hasDb)('Course hard-delete (integration, requires DATABASE_URL)', () => {
  let seedData: SeedResult;
  let adminToken: string;
  let primaryTeacherToken: string;
  let coTeacherToken: string;

  beforeEach(async () => {
    await cleanCourseFixtures();
    adminToken = await login('ebiz@chen.me', 'Paradise@0');
    primaryTeacherToken = await login('teacher@example.com', 'Teacher123!');
    seedData = await seed(adminToken);
    // Login as co-teacher after seed (so the user definitely exists).
    coTeacherToken = await login(COTEACHER_EMAIL, COTEACHER_PASSWORD);
  });

  afterAll(async () => {
    await cleanCourseFixtures();
    await cleanCoTeacher();
  });

  it('GET /api/courses/:id/deletion-preview returns correct counts', async () => {
    const res = await call<{
      courseId: string;
      courseCode: string;
      counts: {
        modules: number;
        readingMaterials: number;
        enrollments: number;
        fileCount: number;
      };
    }>(`/api/courses/${seedData.courseId}/deletion-preview`, {}, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data?.courseCode).toBe(COURSE_CODE);
    expect(res.body.data?.counts.modules).toBe(1);
    expect(res.body.data?.counts.readingMaterials).toBe(1);
    expect(res.body.data?.counts.enrollments).toBe(1);
    expect(res.body.data?.counts.fileCount).toBe(1);
  });

  it('DELETE without confirmCode → 400; course still exists', async () => {
    const res = await call(
      `/api/courses/${seedData.courseId}`,
      { method: 'DELETE', body: JSON.stringify({}) },
      primaryTeacherToken,
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');

    const db = createDb(env.DATABASE_URL);
    const stillThere = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, seedData.courseId));
    expect(stillThere.length).toBe(1);
  });

  it('DELETE with wrong confirmCode → 400; course still exists', async () => {
    const res = await call(
      `/api/courses/${seedData.courseId}`,
      { method: 'DELETE', body: JSON.stringify({ confirmCode: 'WRONG' }) },
      primaryTeacherToken,
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');

    const db = createDb(env.DATABASE_URL);
    const stillThere = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, seedData.courseId));
    expect(stillThere.length).toBe(1);
  });

  it('DELETE as co-teacher → 403; course still exists', async () => {
    const res = await call(
      `/api/courses/${seedData.courseId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirmCode: COURSE_CODE }),
      },
      coTeacherToken,
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');

    const db = createDb(env.DATABASE_URL);
    const stillThere = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, seedData.courseId));
    expect(stillThere.length).toBe(1);
  });

  it('DELETE as primary teacher with correct confirmCode → 200; cascade + audit + cleanup job', async () => {
    const courseId = seedData.courseId;
    const res = await call(
      `/api/courses/${courseId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirmCode: COURSE_CODE }),
      },
      primaryTeacherToken,
    );
    expect(res.status).toBe(200);

    const db = createDb(env.DATABASE_URL);

    // 1. Course gone.
    const coursesLeft = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, courseId));
    expect(coursesLeft.length).toBe(0);

    // 2. Audit log written exactly once.
    const logs = await db
      .select({
        courseCode: courseDeletionLog.courseCode,
        childCounts: courseDeletionLog.childCounts,
      })
      .from(courseDeletionLog)
      .where(eq(courseDeletionLog.courseId, courseId));
    expect(logs.length).toBe(1);
    expect(logs[0]?.courseCode).toBe(COURSE_CODE);
    const counts = logs[0]?.childCounts as { modules?: number } | null;
    expect(counts?.modules).toBe(1);

    // 3. R2 cleanup job queued exactly once with status='pending'.
    const jobs = await db
      .select({ id: r2CleanupJobs.id, status: r2CleanupJobs.status })
      .from(r2CleanupJobs)
      .where(eq(r2CleanupJobs.courseId, courseId));
    expect(jobs.length).toBe(1);
    expect(jobs[0]?.status).toBe('pending');

    // 4. Cascade verification — every course-scoped child table has zero rows
    // for the deleted courseId. Done with raw drizzle selects so we exercise
    // the actual FK chain end-to-end.
    const moduleRows = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, courseId));
    expect(moduleRows.length).toBe(0);

    const materialRows = await db
      .select({ id: readingMaterials.id })
      .from(readingMaterials)
      .where(eq(readingMaterials.courseId, courseId));
    expect(materialRows.length).toBe(0);

    const enrollmentRows = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId));
    expect(enrollmentRows.length).toBe(0);

    const fileRows = await db
      .select({ id: fileAssets.id })
      .from(fileAssets)
      .where(eq(fileAssets.courseId, courseId));
    expect(fileRows.length).toBe(0);

    const teacherRows = await db
      .select({ id: courseTeachers.id })
      .from(courseTeachers)
      .where(eq(courseTeachers.courseId, courseId));
    expect(teacherRows.length).toBe(0);
  });
});

// Suppress unused-import warnings for helpers reserved for future tests
// (the typed `and` import keeps additions cheap, like in teacherInvitations).
void and;
