/**
 * DB-less coverage for the quiz-sets router. Verifies that the routes are wired
 * into the app and that unauthenticated callers receive 401 before any DB access
 * is attempted. Mirrors assignmentGroups.permissions.test.ts.
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

describe('Quiz-set route wiring', () => {
  const courseId = '00000000-0000-0000-0000-000000000000';
  const setId = '00000000-0000-0000-0000-000000000001';

  it('GET /api/courses/:id/quiz-sets without auth → 401', async () => {
    const res = await app.request(`/api/courses/${courseId}/quiz-sets`, {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/courses/:id/quiz-sets without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/quiz-sets`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Weekly', scoringRule: 'highest' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('PATCH .../:setId without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/quiz-sets/${setId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('DELETE .../:setId without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/quiz-sets/${setId}`,
      {
        method: 'DELETE',
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
