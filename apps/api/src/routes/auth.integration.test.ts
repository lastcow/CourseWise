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

interface LoginBody {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    user: { email: string; role: string };
  };
  error?: { code: string };
}

async function postJson(path: string, body: unknown) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe.skipIf(!hasDb)('auth integration (requires DATABASE_URL)', () => {
  it('logs in the seeded admin', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'ebiz@chen.me',
      password: 'Paradise@0',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginBody;
    expect(body.success).toBe(true);
    expect(body.data?.user.role).toBe('admin');
    expect(typeof body.data?.accessToken).toBe('string');
    expect(typeof body.data?.refreshToken).toBe('string');
  });

  it('logs in the seeded teacher', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'teacher@example.com',
      password: 'Teacher123!',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginBody;
    expect(body.success).toBe(true);
    expect(body.data?.user.role).toBe('teacher');
  });

  it('logs in each seeded student', async () => {
    for (const email of ['student1@example.com', 'student2@example.com', 'student3@example.com']) {
      const res = await postJson('/api/auth/login', {
        email,
        password: 'Student123!',
      });
      expect(res.status, `login ${email}`).toBe(200);
      const body = (await res.json()) as LoginBody;
      expect(body.data?.user.role).toBe('student');
    }
  });

  it('rejects an unknown email', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as LoginBody;
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a wrong password', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'ebiz@chen.me',
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as LoginBody;
    expect(body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens and refuses reuse', async () => {
    const loginRes = await postJson('/api/auth/login', {
      email: 'teacher@example.com',
      password: 'Teacher123!',
    });
    const login = (await loginRes.json()) as LoginBody;
    const refreshToken = login.data?.refreshToken;
    expect(refreshToken).toBeTruthy();

    const refresh1 = await postJson('/api/auth/refresh', { refreshToken });
    expect(refresh1.status).toBe(200);
    const refreshed = (await refresh1.json()) as LoginBody;
    expect(refreshed.data?.refreshToken).toBeTruthy();
    expect(refreshed.data?.refreshToken).not.toBe(refreshToken);

    // Reusing the original should fail and revoke the family.
    const refresh2 = await postJson('/api/auth/refresh', { refreshToken });
    expect(refresh2.status).toBe(401);

    // New refresh token from the family should also now be invalid.
    const refresh3 = await postJson('/api/auth/refresh', {
      refreshToken: refreshed.data?.refreshToken,
    });
    expect(refresh3.status).toBe(401);
  });

  it('register requires a valid invitation code', async () => {
    const res = await postJson('/api/auth/register-student', {
      email: `nope-${Date.now()}@example.com`,
      password: 'Student123!',
      name: 'Nope',
      invitationCode: 'not-a-real-code',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as LoginBody;
    expect(body.error?.code).toBe('INVALID_INVITATION');
  });

  it('logout revokes the refresh token family', async () => {
    const loginRes = await postJson('/api/auth/login', {
      email: 'student1@example.com',
      password: 'Student123!',
    });
    const login = (await loginRes.json()) as LoginBody;
    const refreshToken = login.data?.refreshToken;
    const accessToken = login.data?.accessToken;
    expect(refreshToken).toBeTruthy();
    expect(accessToken).toBeTruthy();
    const logoutRes = await app.request(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      },
      env,
    );
    expect(logoutRes.status).toBe(200);
    const next = await postJson('/api/auth/refresh', { refreshToken });
    expect(next.status).toBe(401);
  });

  it('logout without a bearer token is rejected', async () => {
    const loginRes = await postJson('/api/auth/login', {
      email: 'student2@example.com',
      password: 'Student123!',
    });
    const login = (await loginRes.json()) as LoginBody;
    const refreshToken = login.data?.refreshToken;
    const logoutRes = await postJson('/api/auth/logout', { refreshToken });
    expect(logoutRes.status).toBe(401);
  });
});
