/**
 * Wiring smoke tests for the course hard-delete routes. Exercises only the
 * unauthenticated-401 paths; behavior under real auth is covered by the
 * integration test (Task 11).
 */
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

describe('Course hard-delete route wiring', () => {
  it('GET /api/courses/:id/deletion-preview without auth → 401', async () => {
    const res = await app.request(
      '/api/courses/00000000-0000-0000-0000-000000000000/deletion-preview',
      {},
      env,
    );
    expect(res.status).toBe(401);
  });

  it('DELETE /api/courses/:id without auth → 401', async () => {
    const res = await app.request(
      '/api/courses/00000000-0000-0000-0000-000000000000',
      { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });
});
