import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import {
  enrollments,
  refreshTokens,
  teacherInvitations,
  teacherProfiles,
  users,
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
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
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

async function login(email: string, password: string): Promise<string> {
  const res = await call<{ accessToken: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  return res.body.data!.accessToken;
}

function uniqueEmail() {
  const id = Math.random().toString(36).slice(2, 10);
  return `inv-${Date.now()}-${id}@cou16.test`;
}

interface CreatedTeacherInvitationBody {
  id: string;
  email: string;
  status: string;
  token: string;
  inviteUrl: string;
}

interface InvitationListBody {
  items: Array<{ id: string; email: string; status: string }>;
  total: number;
  page: number;
  pageSize: number;
}

interface InvitationLookupBody {
  email: string;
  expiresAt: string;
  inviterName: string;
}

interface RegisterTeacherBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

async function cleanupUserAndInvites(email: string) {
  if (!hasDb) return;
  const db = createDb(env.DATABASE_URL);
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  for (const user of userRows) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await db.delete(enrollments).where(eq(enrollments.studentId, user.id));
    await db.delete(teacherProfiles).where(eq(teacherProfiles.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db
    .delete(teacherInvitations)
    .where(sql`lower(${teacherInvitations.email}) = lower(${email})`);
}

describe.skipIf(!hasDb)('teacher invitations integration (requires DATABASE_URL)', () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    while (createdEmails.length) {
      const email = createdEmails.pop();
      if (email) await cleanupUserAndInvites(email);
    }
  });

  it('admin can create, look up, and accept a teacher invitation end-to-end', async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const created = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      { method: 'POST', body: JSON.stringify({ email, name: 'New Teach' }) },
      adminToken,
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.status).toBe('pending');
    expect(typeof created.body.data?.token).toBe('string');
    expect(created.body.data?.inviteUrl).toContain('/teacher/accept-invite?token=');
    const token = created.body.data!.token;

    const lookup = await call<InvitationLookupBody>(
      `/api/auth/teacher-invitations/${encodeURIComponent(token)}`,
    );
    expect(lookup.status).toBe(200);
    expect(lookup.body.data?.email.toLowerCase()).toBe(email.toLowerCase());

    const register = await call<RegisterTeacherBody>('/api/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'New Teach', password: 'SuperSecret1!' }),
    });
    expect(register.status).toBe(201);
    expect(register.body.data?.user.role).toBe('teacher');
    expect(register.body.data?.user.email.toLowerCase()).toBe(email.toLowerCase());

    // Token should now be unusable for a second registration.
    const reuse = await call('/api/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'Again', password: 'AnotherPass1!' }),
    });
    expect(reuse.status).toBe(410);
    expect(reuse.body.error?.code).toBe('INVITATION_ACCEPTED');

    // The newly created teacher can list courses (their list is empty by default).
    const myCourses = await call<unknown[]>('/api/courses', {}, register.body.data!.accessToken);
    expect(myCourses.status).toBe(200);
    expect(Array.isArray(myCourses.body.data)).toBe(true);
  });

  it('rejects an invitation for an email that already has a user', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const res = await call(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'teacher@example.com' }),
      },
      adminToken,
    );
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('EMAIL_ALREADY_USER');
  });

  it('reissuing an invite revokes the previous token', async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const first = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    expect(first.status).toBe(201);
    const firstToken = first.body.data!.token;

    const second = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    expect(second.status).toBe(201);
    expect(second.body.data!.token).not.toBe(firstToken);

    const oldLookup = await call(`/api/auth/teacher-invitations/${encodeURIComponent(firstToken)}`);
    expect(oldLookup.status).toBe(410);
    expect(oldLookup.body.error?.code).toBe('INVITATION_REVOKED');

    const newLookup = await call(
      `/api/auth/teacher-invitations/${encodeURIComponent(second.body.data!.token)}`,
    );
    expect(newLookup.status).toBe(200);
  });

  it('revoke endpoint makes the token unusable with a typed error', async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const created = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    const token = created.body.data!.token;
    const id = created.body.data!.id;

    const revoke = await call(
      `/api/admin/teacher-invitations/${id}/revoke`,
      {
        method: 'POST',
      },
      adminToken,
    );
    expect(revoke.status).toBe(200);

    const lookup = await call(`/api/auth/teacher-invitations/${encodeURIComponent(token)}`);
    expect(lookup.status).toBe(410);
    expect(lookup.body.error?.code).toBe('INVITATION_REVOKED');

    const register = await call('/api/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'X', password: 'SuperSecret1!' }),
    });
    expect(register.status).toBe(410);
    expect(register.body.error?.code).toBe('INVITATION_REVOKED');
  });

  it('expired invitations are rejected with a typed error', async () => {
    if (!hasDb) return;
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const created = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    expect(created.status).toBe(201);
    const token = created.body.data!.token;
    const id = created.body.data!.id;

    // Force-expire the invitation in the DB.
    const db = createDb(env.DATABASE_URL);
    const pastIso = new Date(Date.now() - 60 * 1000).toISOString();
    await db
      .update(teacherInvitations)
      .set({ expiresAt: pastIso, updatedAt: pastIso })
      .where(eq(teacherInvitations.id, id));

    const lookup = await call(`/api/auth/teacher-invitations/${encodeURIComponent(token)}`);
    expect(lookup.status).toBe(410);
    expect(lookup.body.error?.code).toBe('INVITATION_EXPIRED');

    const register = await call('/api/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'X', password: 'SuperSecret1!' }),
    });
    expect(register.status).toBe(410);
    expect(register.body.error?.code).toBe('INVITATION_EXPIRED');
  });

  it('resend rotates the token and resets expiry', async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const created = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    const oldToken = created.body.data!.token;

    const resend = await call<CreatedTeacherInvitationBody>(
      `/api/admin/teacher-invitations/${created.body.data!.id}/resend`,
      { method: 'POST' },
      adminToken,
    );
    expect(resend.status).toBe(200);
    expect(resend.body.data!.token).not.toBe(oldToken);

    const oldLookup = await call(`/api/auth/teacher-invitations/${encodeURIComponent(oldToken)}`);
    expect(oldLookup.status).toBe(404);

    const newLookup = await call(
      `/api/auth/teacher-invitations/${encodeURIComponent(resend.body.data!.token)}`,
    );
    expect(newLookup.status).toBe(200);
  });

  it('non-admin (teacher) cannot reach the admin endpoints', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const res = await call('/api/admin/teacher-invitations', {}, teacherToken);
    expect(res.status).toBe(403);
  });

  it('listing supports filtering by status', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const pending = await call<InvitationListBody>(
      '/api/admin/teacher-invitations?status=pending',
      {},
      adminToken,
    );
    expect(pending.status).toBe(200);
    expect(Array.isArray(pending.body.data?.items)).toBe(true);
    for (const item of pending.body.data?.items ?? []) {
      expect(item.status).toBe('pending');
    }

    const revoked = await call<InvitationListBody>(
      '/api/admin/teacher-invitations?status=revoked',
      {},
      adminToken,
    );
    expect(revoked.status).toBe(200);
    for (const item of revoked.body.data?.items ?? []) {
      expect(item.status).toBe('revoked');
    }
  });

  it('admin /api/admin/teachers returns the teacher list with course counts', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const res = await call<Array<{ name: string; email: string; courseCount: number }>>(
      '/api/admin/teachers',
      {},
      adminToken,
    );
    expect(res.status).toBe(200);
    const seeded = (res.body.data ?? []).find(
      (t) => t.email.toLowerCase() === 'teacher@example.com',
    );
    expect(seeded).toBeTruthy();
    expect(seeded!.courseCount).toBeGreaterThanOrEqual(1);
  });

  it('a newly-registered teacher can create a course and becomes its owner', async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');

    const invite = await call<CreatedTeacherInvitationBody>(
      '/api/admin/teacher-invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      adminToken,
    );
    const token = invite.body.data!.token;

    const register = await call<RegisterTeacherBody>('/api/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'Course Owner', password: 'SuperSecret1!' }),
    });
    expect(register.status).toBe(201);
    const teacherToken = register.body.data!.accessToken;

    const code = `COU16-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const createCourse = await call<{ id: string; code: string }>(
      '/api/courses',
      {
        method: 'POST',
        body: JSON.stringify({ code, title: 'New teacher course' }),
      },
      teacherToken,
    );
    expect(createCourse.status).toBe(201);
    expect(createCourse.body.data?.code).toBe(code);

    // The teacher should be listed as a teacher of the course they just made.
    const detail = await call<{ teachers: Array<{ email: string }> }>(
      `/api/courses/${createCourse.body.data!.id}`,
      {},
      teacherToken,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data?.teachers.map((t) => t.email.toLowerCase())).toContain(
      email.toLowerCase(),
    );

    // A different teacher cannot read/edit this course.
    const otherTeacherToken = await login('teacher@example.com', 'Teacher123!');
    const denied = await call(`/api/courses/${createCourse.body.data!.id}`, {}, otherTeacherToken);
    expect(denied.status).toBe(403);

    // Cleanup the course.
    if (createCourse.body.data?.id) {
      const db = createDb(env.DATABASE_URL);
      await db.delete(enrollments).where(eq(enrollments.courseId, createCourse.body.data.id));
      // The schema cascades course_teachers when the course is deleted.
      // We rely on the API's delete endpoint via admin to remove the course.
      const adminDelete = await call(
        `/api/courses/${createCourse.body.data.id}`,
        { method: 'DELETE' },
        adminToken,
      );
      expect([200, 204]).toContain(adminDelete.status);
    }
  });
});

// And-condition import suppression: drizzle's `and()` is used in the cleanup
// helpers (the import is kept so future test additions don't need to re-add it).
void and;
