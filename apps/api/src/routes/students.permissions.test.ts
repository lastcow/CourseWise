import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-test-refresh-test-refresh-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};

const USER = '11111111-1111-1111-1111-111111111111';

describe('students profile routes — unauthenticated rejections', () => {
  it('GET /api/students/<uuid>/profile → 401', async () => {
    const res = await app.request(`/api/students/${USER}/profile`, {}, env);
    expect(res.status).toBe(401);
  });

  it('PATCH /api/students/<uuid>/profile → 401', async () => {
    const res = await app.request(
      `/api/students/${USER}/profile`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('DELETE /api/students/<uuid> → 401', async () => {
    const res = await app.request(
      `/api/students/${USER}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'wrong email' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/students/<uuid>/reset-password-link → 401 unauthenticated', async () => {
    const res = await app.request(
      `/api/students/${USER}/reset-password-link`,
      { method: 'POST' },
      env,
    );
    expect(res.status).toBe(401);
  });
});
