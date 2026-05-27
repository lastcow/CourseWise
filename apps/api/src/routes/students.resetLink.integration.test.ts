/**
 * Integration coverage for the admin/teacher
 * POST /api/students/:userId/reset-password-link endpoint.
 *
 * Gated on DATABASE_URL like the other M2 integration tests, so CI without a
 * Neon instance still runs typecheck/lint/build cleanly. The assertions still
 * typecheck when skipped.
 *
 * Relies on the shared seed (pnpm --filter @coursewise/api db:seed):
 *   - admin    ebiz@chen.me / Paradise@0
 *   - teacher  teacher@example.com / Teacher123!  (teaches MGMT101)
 *   - students student1..3@example.com / Student123!  (enrolled in MGMT101)
 * A throwaway "non-owning" teacher is seeded per-run and cleaned up in
 * afterAll so the 403 case doesn't depend on seed topology.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import { passwordResetTokens, users } from '../db/schema';
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
  BCRYPT_ROUNDS: '10',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

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

const db = hasDb ? createDb(env.DATABASE_URL) : null;
const createdUserIds: string[] = [];

async function userIdByEmail(email: string): Promise<string> {
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`seed user not found: ${email} (run db:seed)`);
  return row.id;
}

/** Seed a throwaway teacher with no course overlap with the seed students. */
async function seedLoneTeacher(): Promise<{ id: string; email: string; password: string }> {
  const password = 'LoneTeacher123!';
  const email = `lone-teacher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const passwordHash = await hashPassword(password, 10);
  const inserted = (
    await db!
      .insert(users)
      .values({ email, passwordHash, name: 'Lone Teacher', role: 'teacher', status: 'active' })
      .returning({ id: users.id, email: users.email })
  )[0]!;
  createdUserIds.push(inserted.id);
  return { id: inserted.id, email: inserted.email, password };
}

describe.skipIf(!hasDb)('admin/teacher reset-password-link (requires DATABASE_URL)', () => {
  afterAll(async () => {
    if (!db || createdUserIds.length === 0) return;
    // password_reset_tokens cascade on user delete.
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it('admin → 200 with a /reset-password?token= link and a fresh token row', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const studentId = await userIdByEmail('student1@example.com');

    const res = await call<{ resetUrl: string; emailSent: boolean }>(
      `/api/students/${studentId}/reset-password-link`,
      { method: 'POST' },
      adminToken,
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.resetUrl).toContain('/reset-password?token=');
    // No SEND_EMAIL binding in tests → best-effort send is skipped.
    expect(res.body.data?.emailSent).toBe(false);

    const rows = await db!
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, studentId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('owning teacher → 200 (teacher teaches the course the student is enrolled in)', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentId = await userIdByEmail('student2@example.com');

    const res = await call<{ resetUrl: string; emailSent: boolean }>(
      `/api/students/${studentId}/reset-password-link`,
      { method: 'POST' },
      teacherToken,
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.resetUrl).toContain('/reset-password?token=');
  });

  it('non-owning teacher → 403 (no shared course with the student)', async () => {
    const lone = await seedLoneTeacher();
    const loneToken = await login(lone.email, lone.password);
    const studentId = await userIdByEmail('student3@example.com');

    const res = await call(
      `/api/students/${studentId}/reset-password-link`,
      { method: 'POST' },
      loneToken,
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('student caller → 403', async () => {
    const studentToken = await login('student1@example.com', 'Student123!');
    const otherStudentId = await userIdByEmail('student2@example.com');

    const res = await call(
      `/api/students/${otherStudentId}/reset-password-link`,
      { method: 'POST' },
      studentToken,
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('unknown userId → 404 (admin caller passes the permission gate)', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const unknownId = '00000000-0000-0000-0000-000000000000';

    const res = await call(
      `/api/students/${unknownId}/reset-password-link`,
      { method: 'POST' },
      adminToken,
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
