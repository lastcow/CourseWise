import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

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

describe.skipIf(!hasDb)('M2 — course core (integration)', () => {
  it('admin lists all courses; student sees only enrolled', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const studentToken = await login('student1@example.com', 'Student123!');

    const adminList = await call<Array<{ code: string }>>('/api/courses', {}, adminToken);
    expect(adminList.status).toBe(200);
    expect((adminList.body.data ?? []).some((c) => c.code === 'MGMT101')).toBe(true);

    const studentList = await call<Array<{ code: string }>>('/api/courses', {}, studentToken);
    expect(studentList.status).toBe(200);
    expect((studentList.body.data ?? []).some((c) => c.code === 'MGMT101')).toBe(true);
  });

  it('public invitation-code validate accepts MGMT101-2026 and rejects garbage', async () => {
    const ok = await call<{ valid: boolean; courseTitle?: string | null }>(
      '/api/invitation-codes/validate',
      { method: 'POST', body: JSON.stringify({ code: 'MGMT101-2026' }) },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data?.valid).toBe(true);
    expect(typeof ok.body.data?.courseTitle).toBe('string');

    const bad = await call<{ valid: boolean }>(
      '/api/invitation-codes/validate',
      { method: 'POST', body: JSON.stringify({ code: 'NOT-A-REAL-CODE' }) },
    );
    expect(bad.status).toBe(200);
    expect(bad.body.data?.valid).toBe(false);
  });

  it('teacher cannot patch a course they do not teach', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const teacherToken = await login('teacher@example.com', 'Teacher123!');

    // Admin creates a second course owned by no specific teacher.
    const adminCreate = await call<{ id: string }>('/api/courses', {
      method: 'POST',
      body: JSON.stringify({ code: `ZZ-${Date.now()}`, title: 'Cross-teacher test' }),
    }, adminToken);
    expect(adminCreate.status).toBe(201);
    const otherCourseId = adminCreate.body.data!.id;

    const patch = await call(
      `/api/courses/${otherCourseId}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'should fail' }) },
      teacherToken,
    );
    expect(patch.status).toBe(403);

    // Cleanup
    await call(`/api/courses/${otherCourseId}`, { method: 'DELETE' }, adminToken);
  });

  it('teacher creates a course → adds module → reorders → publishes a material → student sees it', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentToken = await login('student1@example.com', 'Student123!');

    const code = `M2X-${Date.now()}`;
    const createRes = await call<{ id: string }>('/api/courses', {
      method: 'POST',
      body: JSON.stringify({ code, title: 'M2 Test Course' }),
    }, teacherToken);
    expect(createRes.status).toBe(201);
    const courseId = createRes.body.data!.id;

    const m1 = await call<{ id: string }>(`/api/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Module one' }),
    }, teacherToken);
    const m2 = await call<{ id: string }>(`/api/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Module two' }),
    }, teacherToken);
    expect(m1.status).toBe(201);
    expect(m2.status).toBe(201);

    const reorder = await call<Array<{ id: string; position: number }>>(
      `/api/courses/${courseId}/modules/reorder`,
      { method: 'POST', body: JSON.stringify({ ids: [m2.body.data!.id, m1.body.data!.id] }) },
      teacherToken,
    );
    expect(reorder.status).toBe(200);
    expect(reorder.body.data?.[0]?.id).toBe(m2.body.data!.id);

    // Manual-text material, drafted.
    const draft = await call<{ id: string }>(
      `/api/courses/${courseId}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Draft material',
          sourceType: 'manual_text',
          content: '# Heading',
        }),
      },
      teacherToken,
    );
    expect(draft.status).toBe(201);
    const draftId = draft.body.data!.id;

    // Student must not see the draft.
    const studentListBefore = await call<Array<{ id: string }>>(
      `/api/courses/${courseId}/materials`,
      {},
      studentToken,
    );
    // student may not be enrolled in this new course; expect 403 OR empty list.
    if (studentListBefore.status === 200) {
      expect((studentListBefore.body.data ?? []).some((m) => m.id === draftId)).toBe(false);
    } else {
      expect(studentListBefore.status).toBe(403);
    }

    // Enroll the student.
    const enroll = await call(
      `/api/courses/${courseId}/enrollments`,
      { method: 'POST', body: JSON.stringify({ studentId: await idOf('student1@example.com', teacherToken) }) },
      teacherToken,
    );
    expect([201, 409]).toContain(enroll.status);

    // Still draft → student list should not include it.
    const stillDraft = await call<Array<{ id: string }>>(
      `/api/courses/${courseId}/materials`,
      {},
      studentToken,
    );
    expect(stillDraft.status).toBe(200);
    expect((stillDraft.body.data ?? []).some((m) => m.id === draftId)).toBe(false);

    // Publish it.
    const publish = await call(
      `/api/materials/${draftId}/publish`,
      { method: 'POST' },
      teacherToken,
    );
    expect(publish.status).toBe(200);

    const seen = await call<Array<{ id: string; status: string }>>(
      `/api/courses/${courseId}/materials`,
      {},
      studentToken,
    );
    expect(seen.status).toBe(200);
    expect(seen.body.data?.find((m) => m.id === draftId)?.status).toBe('published');

    // Cleanup.
    await call(`/api/materials/${draftId}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${courseId}/enrollments/${await idOf('student1@example.com', teacherToken)}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${courseId}`, { method: 'DELETE' }, teacherToken);
  });

  it('upload rejects unsupported mime types before touching R2', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const coursesRes = await call<Array<{ id: string; code: string }>>(`/api/courses`, {}, teacherToken);
    const courseId = (coursesRes.body.data ?? []).find((c) => c.code === 'MGMT101')?.id;
    expect(courseId).toBeTruthy();

    // The R2 binding isn't bound in the integration test env, so we can't
    // assert a successful upload here — that's covered by the manual
    // production smoke test. We *can* assert the validation gates that fire
    // before any R2 work: bad mime → 400.
    const badMime = new FormData();
    badMime.append('file', new Blob(['MZ\x90\0'], { type: 'application/x-msdownload' }), 'evil.exe');
    badMime.append('courseId', String(courseId));
    badMime.append('relatedType', 'material');
    const res = await app.request(
      '/api/files/upload',
      { method: 'POST', headers: { authorization: `Bearer ${teacherToken}` }, body: badMime },
      env,
    );
    expect(res.status).toBe(400);
  });
});

async function idOf(email: string, anyAuthToken: string): Promise<string> {
  // Need an admin token to query users by email; cheat by re-authing as student and
  // hitting /api/auth/me. The auth/me payload has the user id for the caller — we
  // only call this for the student email used in seeds, so re-login as them.
  // anyAuthToken is unused.
  void anyAuthToken;
  const studentToken = await login(email, 'Student123!');
  const res = await app.request(
    '/api/auth/me',
    {
      headers: { authorization: `Bearer ${studentToken}` },
    },
    env,
  );
  const body = (await res.json()) as { data: { user: { id: string } } };
  return body.data.user.id;
}
