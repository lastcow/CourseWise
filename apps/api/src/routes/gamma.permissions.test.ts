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

describe('gamma routes — unauthenticated rejections', () => {
  it('GET /api/gamma/themes → 401', async () => {
    const res = await app.request('/api/gamma/themes', {}, env);
    expect(res.status).toBe(401);
  });
  it('POST /api/courses/<uuid>/presentations/gamma → 401', async () => {
    const res = await app.request(
      '/api/courses/11111111-1111-1111-1111-111111111111/presentations/gamma',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });
  it('GET /api/gamma-jobs/<uuid> → 401', async () => {
    const res = await app.request(
      '/api/gamma-jobs/11111111-1111-1111-1111-111111111111',
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});
