/**
 * Course export — DB-gated integration (skips without DATABASE_URL).
 *
 * Covers the gather logic (gatherCourseExport over a seeded course) and the
 * route surface (list, request without a workflow binding → failed job, and
 * download-url access checks). The actual ZIP streaming + workflow run happen
 * on Cloudflare and are validated manually post-deploy.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseExportJobs,
  courseTeachers,
  courses,
  enrollments,
  fileAssets,
  finalGrades,
  modules,
  readingMaterials,
} from '../db/schema';
import { gatherCourseExport } from '../services/courseExport';

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

const COURSE_CODE = 'INT-EXP-101';
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
    body = { success: false, error: { code: 'NON_JSON', message: 'Non-JSON' } };
  }
  return { status: res.status, body };
}

async function userId(token: string): Promise<string> {
  const res = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } }, env);
  const body = (await res.json()) as { data: { user: { id: string } } };
  return body.data.user.id;
}

interface Seed {
  courseId: string;
  teacherId: string;
  studentId: string;
}

async function seed(): Promise<Seed> {
  const db = createDb(env.DATABASE_URL);
  const teacherId = await userId(await login(TEACHER_EMAIL, TEACHER_PASSWORD));
  const studentId = await userId(await login(STUDENT1_EMAIL, STUDENT1_PASSWORD));
  const [course] = await db
    .insert(courses)
    .values({
      code: COURSE_CODE,
      title: 'Export Integration 101',
      status: 'active',
      syllabusMd: '# Syllabus\nWeekly labs, one final project.',
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: '2026-04-24T00:00:00.000Z',
    })
    .returning({ id: courses.id });
  const courseId = course!.id;
  await db.insert(courseTeachers).values({ courseId, teacherId, role: 'primary' });
  await db.insert(enrollments).values({ courseId, studentId, status: 'enrolled' });

  await db.insert(readingMaterials).values({
    courseId,
    title: 'Syllabus',
    sourceType: 'manual_text',
    content: '# Welcome\nRead this.',
    status: 'published',
    position: 0,
  });
  const [a] = await db
    .insert(assignments)
    .values({ courseId, title: 'Lab 1', description: 'Do the lab', maxScore: '100.00', status: 'published' })
    .returning({ id: assignments.id });
  const [sub] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId: a!.id,
      studentId,
      status: 'graded',
      content: 'my answer',
      score: '88.00',
      feedback: 'nice',
    })
    .returning({ id: assignmentSubmissions.id });
  // Attachment uploaded alongside the submission (linked polymorphically),
  // the student's cached final grade, a calendar module, and an attendance
  // session + record — independent chains, so inserted in parallel.
  await Promise.all([
    db.insert(fileAssets).values({
      ownerId: studentId,
      courseId,
      objectKey: `courses/${courseId}/submissions/lab1-report.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 1234,
      originalFilename: 'lab1-report.pdf',
      status: 'ready',
      relatedType: 'submission',
      relatedId: sub!.id,
    }),
    db.insert(finalGrades).values({
      courseId,
      studentId,
      score: '91.50',
      letterGrade: 'A-',
    }),
    db.insert(modules).values({
      courseId,
      title: 'Week 1 - Foundations',
      status: 'published',
      position: 0,
      startAt: '2026-01-05T00:00:00.000Z',
      endAt: '2026-01-12T00:00:00.000Z',
    }),
    (async () => {
      const [session] = await db
        .insert(attendanceSessions)
        .values({
          courseId,
          title: 'Lecture 1',
          sessionDate: '2026-01-06T09:00:00.000Z',
          status: 'closed',
          createdById: teacherId,
        })
        .returning({ id: attendanceSessions.id });
      await db.insert(attendanceRecords).values({
        sessionId: session!.id,
        studentId,
        status: 'present',
        recordedById: teacherId,
      });
    })(),
  ]);
  return { courseId, teacherId, studentId };
}

async function clean(): Promise<void> {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  await db.delete(courses).where(eq(courses.code, COURSE_CODE));
}

describe.skipIf(!hasDb)('Course export (integration, requires DATABASE_URL)', () => {
  let s: Seed;
  let teacherToken: string;

  // Seeding is a series of round trips to a remote Postgres; give it headroom
  // beyond the 10s default.
  beforeEach(async () => {
    await clean();
    teacherToken = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
    s = await seed();
  }, 30_000);
  afterAll(async () => {
    await clean();
  });

  // gather is a dozen-plus sequential round trips to a remote Postgres; give
  // it headroom beyond the 5s default.
  it('gatherCourseExport produces the expected entries', { timeout: 30_000 }, async () => {
    const db = createDb(env.DATABASE_URL);
    const manifest = await gatherCourseExport(db, s.courseId);
    expect(manifest).not.toBeNull();
    const paths = manifest!.textEntries.map((e) => e.path);
    expect(paths).toContain('README.txt');
    expect(paths).toContain('final_grades.csv');
    expect(paths.some((p) => p.startsWith('materials/') && p.endsWith('content.md'))).toBe(true);
    expect(paths.some((p) => p.startsWith('assignments/') && p.endsWith('requirement.md'))).toBe(true);
    expect(paths.some((p) => p.includes('/submissions/') && p.endsWith('submission.json'))).toBe(true);

    // final_grades.csv carries the student's final grade — not the per-item 88.
    const csv = manifest!.textEntries.find((e) => e.path === 'final_grades.csv')!.content;
    expect(csv).toContain('91.5');
    expect(csv).toContain('A-');
    expect(csv).toContain(STUDENT1_EMAIL);
    expect(csv).not.toContain('88');

    // The per-item score stays out of the submission record too; feedback stays in.
    const subJson = manifest!.textEntries.find((e) => e.path.endsWith('submission.json'))!.content;
    expect(subJson).not.toContain('"score"');
    expect(subJson).toContain('nice');

    // The submission's attachment is exported under the student's files/ folder.
    expect(
      manifest!.fileEntries.some(
        (f) => f.path.includes('/files/') && f.path.endsWith('lab1-report.pdf'),
      ),
    ).toBe(true);

    // Syllabus + teaching calendar.
    const syllabus = manifest!.textEntries.find((e) => e.path === 'syllabus.md')!.content;
    expect(syllabus).toContain('Weekly labs');
    const calendar = manifest!.textEntries.find((e) => e.path === 'calendar.json')!.content;
    expect(calendar).toContain('2026-01-05');
    expect(calendar).toContain('Week 1 - Foundations');

    // Attendance CSV carries the recorded session row.
    const attendance = manifest!.textEntries.find((e) => e.path === 'attendance.csv')!.content;
    expect(attendance).toContain('Lecture 1');
    expect(attendance).toContain(STUDENT1_EMAIL);
    expect(attendance).toContain('present');
  });

  it('request without a workflow binding marks the job failed (503), then lists it', async () => {
    const created = await call<{ jobId: string }>(
      `/api/courses/${s.courseId}/exports`,
      { method: 'POST' },
      teacherToken,
    );
    // No COURSE_EXPORT_WORKFLOW binding in the test env → 503 + failed job row.
    expect(created.status).toBe(503);

    const list = await call<Array<{ status: string }>>(
      `/api/courses/${s.courseId}/exports`,
      {},
      teacherToken,
    );
    expect(list.status).toBe(200);
    expect(list.body.data?.[0]?.status).toBe('failed');
  });

  it('download-url 404s for an unknown job', async () => {
    const res = await call(
      `/api/courses/${s.courseId}/exports/00000000-0000-0000-0000-000000000000/download-url`,
      {},
      teacherToken,
    );
    expect(res.status).toBe(404);
  });

  it('students cannot request an export', async () => {
    const studentToken = await login(STUDENT1_EMAIL, STUDENT1_PASSWORD);
    const res = await call(`/api/courses/${s.courseId}/exports`, { method: 'POST' }, studentToken);
    expect([403, 401]).toContain(res.status);
    // Touch the table so the import isn't flagged unused when DB is absent.
    void courseExportJobs;
  });
});
