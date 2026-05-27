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

describe('forgot-password — shape', () => {
  it('rejects an invalid email body with 400', async () => {
    const res = await app.request(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('reset-password — shape', () => {
  it('rejects a short password with 400', async () => {
    const res = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'abc', password: 'short' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
