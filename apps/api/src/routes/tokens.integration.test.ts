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
};

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
  const body = (await res.json()) as {
    data?: { accessToken: string };
  };
  if (!body.data) throw new Error(`login failed for ${email}`);
  return body.data.accessToken;
}

interface TokenBody {
  success: boolean;
  data?: { id: string; token: string };
  error?: { code: string };
}

async function createToken(
  accessToken: string,
  path: string,
  body: { name: string; scopes: string[] },
) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe.skipIf(!hasDb)('api tokens integration', () => {
  it('admin can create then revoke an admin-scoped API token', async () => {
    const adminToken = await login('ebiz@chen.me', 'Paradise@0');
    const createRes = await createToken(adminToken, '/api/admin/api-tokens', {
      name: `m1-admin-${Date.now()}`,
      scopes: ['admin:write'],
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as TokenBody;
    expect(created.success).toBe(true);
    expect(created.data?.token).toMatch(/^cmpt_/);
    const id = created.data?.id;
    expect(id).toBeTruthy();

    const revokeRes = await app.request(
      `/api/admin/api-tokens/${id}/revoke`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}` },
      },
      env,
    );
    expect(revokeRes.status).toBe(200);
  });

  it('teacher can create then revoke a teacher-scoped API token', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const createRes = await createToken(teacherToken, '/api/teacher/api-tokens', {
      name: `m1-teacher-${Date.now()}`,
      scopes: ['teacher:read', 'teacher:grades'],
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as TokenBody;
    expect(created.data?.token).toMatch(/^cmpt_/);
    const id = created.data?.id;
    expect(id).toBeTruthy();

    const revokeRes = await app.request(
      `/api/teacher/api-tokens/${id}/revoke`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${teacherToken}` },
      },
      env,
    );
    expect(revokeRes.status).toBe(200);
  });

  it('teacher CANNOT create an admin-scoped API token', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const res = await createToken(teacherToken, '/api/teacher/api-tokens', {
      name: `m1-teacher-bad-${Date.now()}`,
      scopes: ['admin:write'],
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as TokenBody;
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('teacher cannot reach /api/admin/api-tokens', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const res = await app.request(
      '/api/admin/api-tokens',
      { headers: { authorization: `Bearer ${teacherToken}` } },
      env,
    );
    expect(res.status).toBe(403);
  });
});
