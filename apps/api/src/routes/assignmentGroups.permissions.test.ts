/**
 * DB-less coverage for the assignment-groups router. Verifies that the routes
 * are wired into the app and that unauthenticated callers receive 401 before
 * any DB access is attempted.
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

describe('Assignment-group route wiring', () => {
  const courseId = '00000000-0000-0000-0000-000000000000';
  const groupId = '00000000-0000-0000-0000-000000000001';

  it('GET /api/courses/:id/assignment-groups without auth → 401', async () => {
    const res = await app.request(`/api/courses/${courseId}/assignment-groups`, {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/courses/:id/assignment-groups without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/assignment-groups`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Lab', weight: 10 }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('PATCH .../:groupId without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/assignment-groups/${groupId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('DELETE .../:groupId without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/assignment-groups/${groupId}`,
      {
        method: 'DELETE',
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('POST .../reorder without auth → 401', async () => {
    const res = await app.request(
      `/api/courses/${courseId}/assignment-groups/reorder`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds: [groupId] }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
