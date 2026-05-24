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

const COURSE = '11111111-1111-1111-1111-111111111111';
const THREAD = '22222222-2222-2222-2222-222222222222';
const RECIPIENT = '33333333-3333-3333-3333-333333333333';

describe('messages routes — unauthenticated rejections', () => {
  it('POST /api/courses/<uuid>/messages → 401', async () => {
    const res = await app.request(
      `/api/courses/${COURSE}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipientId: RECIPIENT, body: 'hi' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/courses/<uuid>/messages/threads → 401', async () => {
    const res = await app.request(`/api/courses/${COURSE}/messages/threads`, {}, env);
    expect(res.status).toBe(401);
  });

  it('GET /api/courses/<uuid>/messages/threads/<uuid> → 401', async () => {
    const res = await app.request(
      `/api/courses/${COURSE}/messages/threads/${THREAD}`,
      {},
      env,
    );
    expect(res.status).toBe(401);
  });

  it('DELETE /api/courses/<uuid>/messages/threads/<uuid> → 401', async () => {
    const res = await app.request(
      `/api/courses/${COURSE}/messages/threads/${THREAD}`,
      { method: 'DELETE' },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/messages/unread-count → 401', async () => {
    const res = await app.request('/api/messages/unread-count', {}, env);
    expect(res.status).toBe(401);
  });
});
