/**
 * COU-13 — PATCH /api/materials/:id behaviour: editable fields, sourceType
 * switching, permission denial for non-owners and students.
 *
 * Gated on DATABASE_URL like other M2 integration tests, so CI without a
 * Neon instance still runs typecheck/lint/build cleanly.
 */
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

describe.skipIf(!hasDb)('COU-13 — editable reading materials (integration)', () => {
  it('teacher patches own material: title, description, moduleId, content all persist', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');

    // Set up: course + two modules + manual_text material in module A.
    const code = `COU13A-${Date.now()}`;
    const course = await call<{ id: string }>(
      '/api/courses',
      { method: 'POST', body: JSON.stringify({ code, title: 'COU-13 edit test' }) },
      teacherToken,
    );
    expect(course.status).toBe(201);
    const courseId = course.body.data!.id;

    const modA = await call<{ id: string }>(
      `/api/courses/${courseId}/modules`,
      { method: 'POST', body: JSON.stringify({ title: 'Module A' }) },
      teacherToken,
    );
    const modB = await call<{ id: string }>(
      `/api/courses/${courseId}/modules`,
      { method: 'POST', body: JSON.stringify({ title: 'Module B' }) },
      teacherToken,
    );

    const created = await call<{
      id: string;
      title: string;
      description: string | null;
      moduleId: string | null;
    }>(
      `/api/courses/${courseId}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Original',
          description: 'first draft',
          sourceType: 'manual_text',
          content: '# Hello',
          moduleId: modA.body.data!.id,
        }),
      },
      teacherToken,
    );
    expect(created.status).toBe(201);
    const matId = created.body.data!.id;
    expect(created.body.data?.description).toBe('first draft');

    // PATCH title + description + moduleId + content.
    const patched = await call<{
      title: string;
      description: string | null;
      moduleId: string | null;
      content: string | null;
    }>(
      `/api/materials/${matId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Renamed',
          description: 'revised desc',
          moduleId: modB.body.data!.id,
          content: '# Hello v2',
        }),
      },
      teacherToken,
    );
    expect(patched.status).toBe(200);
    expect(patched.body.data?.title).toBe('Renamed');
    expect(patched.body.data?.description).toBe('revised desc');
    expect(patched.body.data?.moduleId).toBe(modB.body.data!.id);
    expect(patched.body.data?.content).toBe('# Hello v2');

    // PATCH moduleId to null — should unlink from any module.
    const unlinked = await call<{ moduleId: string | null }>(
      `/api/materials/${matId}`,
      { method: 'PATCH', body: JSON.stringify({ moduleId: null }) },
      teacherToken,
    );
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data?.moduleId).toBe(null);

    // Cleanup.
    await call(`/api/materials/${matId}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${courseId}`, { method: 'DELETE' }, teacherToken);
  });

  it('teacher switches sourceType between manual_text and external_link', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');

    const code = `COU13B-${Date.now()}`;
    const course = await call<{ id: string }>(
      '/api/courses',
      { method: 'POST', body: JSON.stringify({ code, title: 'COU-13 sourceType test' }) },
      teacherToken,
    );
    const courseId = course.body.data!.id;

    const created = await call<{ id: string; sourceType: string }>(
      `/api/courses/${courseId}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Switcher',
          sourceType: 'manual_text',
          content: 'note body',
        }),
      },
      teacherToken,
    );
    const matId = created.body.data!.id;

    // Switch to external_link with a URL.
    const toLink = await call<{ sourceType: string; externalUrl: string | null }>(
      `/api/materials/${matId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sourceType: 'external_link',
          externalUrl: 'https://example.com/doc',
          content: null,
        }),
      },
      teacherToken,
    );
    expect(toLink.status).toBe(200);
    expect(toLink.body.data?.sourceType).toBe('external_link');
    expect(toLink.body.data?.externalUrl).toBe('https://example.com/doc');

    // Switching to external_link without providing externalUrl AND without an
    // existing one should be rejected (this material has one now; clear it
    // by attempting a bogus switch back to upload without fileAssetId).
    const bad = await call(
      `/api/materials/${matId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ sourceType: 'upload', fileAssetId: null, externalUrl: null }),
      },
      teacherToken,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('VALIDATION_ERROR');

    // Switch back to manual_text, providing content.
    const back = await call<{ sourceType: string; content: string | null }>(
      `/api/materials/${matId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sourceType: 'manual_text',
          content: 'note again',
          externalUrl: null,
        }),
      },
      teacherToken,
    );
    expect(back.status).toBe(200);
    expect(back.body.data?.sourceType).toBe('manual_text');
    expect(back.body.data?.content).toBe('note again');

    // Cleanup.
    await call(`/api/materials/${matId}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${courseId}`, { method: 'DELETE' }, teacherToken);
  });

  it('PATCH /api/materials/:id is denied when caller is not the course teacher / admin', async () => {
    // Setup: admin creates a course assigned to teacher@example.com; only that
    // teacher (or admin) can patch its materials. We use admin to create the
    // material, then assert a student token cannot patch it.
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const studentToken = await login('student1@example.com', 'Student123!');

    const code = `COU13C-${Date.now()}`;
    const course = await call<{ id: string }>(
      '/api/courses',
      { method: 'POST', body: JSON.stringify({ code, title: 'COU-13 perm test' }) },
      adminToken,
    );
    const courseId = course.body.data!.id;

    const created = await call<{ id: string }>(
      `/api/courses/${courseId}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Protected',
          sourceType: 'manual_text',
          content: 'admin-only',
        }),
      },
      adminToken,
    );
    const matId = created.body.data!.id;

    // Student write attempt → forbidden. Scope group check rejects students
    // with 403 before the course-access check runs.
    const studentPatch = await call(
      `/api/materials/${matId}`,
      { method: 'PATCH', body: JSON.stringify({ title: 'pwned' }) },
      studentToken,
    );
    expect([401, 403]).toContain(studentPatch.status);

    // Cleanup.
    await call(`/api/materials/${matId}`, { method: 'DELETE' }, adminToken);
    await call(`/api/courses/${courseId}`, { method: 'DELETE' }, adminToken);
  });

  it('rejects moduleId that belongs to a different course', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');

    const code1 = `COU13D1-${Date.now()}`;
    const code2 = `COU13D2-${Date.now()}`;
    const c1 = await call<{ id: string }>(
      '/api/courses',
      { method: 'POST', body: JSON.stringify({ code: code1, title: 'C1' }) },
      teacherToken,
    );
    const c2 = await call<{ id: string }>(
      '/api/courses',
      { method: 'POST', body: JSON.stringify({ code: code2, title: 'C2' }) },
      teacherToken,
    );
    const c2Module = await call<{ id: string }>(
      `/api/courses/${c2.body.data!.id}/modules`,
      { method: 'POST', body: JSON.stringify({ title: 'M' }) },
      teacherToken,
    );
    const mat = await call<{ id: string }>(
      `/api/courses/${c1.body.data!.id}/materials`,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'mat', sourceType: 'manual_text', content: 'x' }),
      },
      teacherToken,
    );

    const cross = await call(
      `/api/materials/${mat.body.data!.id}`,
      { method: 'PATCH', body: JSON.stringify({ moduleId: c2Module.body.data!.id }) },
      teacherToken,
    );
    expect(cross.status).toBe(400);
    expect(cross.body.error?.code).toBe('VALIDATION_ERROR');

    // Cleanup.
    await call(`/api/materials/${mat.body.data!.id}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${c1.body.data!.id}`, { method: 'DELETE' }, teacherToken);
    await call(`/api/courses/${c2.body.data!.id}`, { method: 'DELETE' }, teacherToken);
  });
});
