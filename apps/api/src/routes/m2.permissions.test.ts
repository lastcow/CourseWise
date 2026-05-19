/**
 * Permission-shape tests that DO NOT require a database connection — they
 * exercise the rejection paths that fire before the DB query happens.
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

describe('M2 routes — unauthenticated rejections', () => {
  it('GET /api/courses without auth → 401', async () => {
    const res = await app.request('/api/courses', {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/courses without auth → 401', async () => {
    const res = await app.request(
      '/api/courses',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/invitation-codes without auth → 401', async () => {
    const res = await app.request('/api/invitation-codes', {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/files/upload without auth → 401', async () => {
    const res = await app.request(
      '/api/files/upload',
      { method: 'POST', body: new FormData() },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('M2 — invitation-codes validate (authenticated as of COU-17)', () => {
  it('rejects unauthenticated callers with 401 (the route is no longer public)', async () => {
    const res = await app.request(
      '/api/invitation-codes/validate',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('M2 — /files/upload requires auth before any body parsing', () => {
  it('returns 401 even when the body is malformed multipart', async () => {
    const form = new FormData();
    form.append('not-a-file', 'oops');
    const res = await app.request('/api/files/upload', { method: 'POST', body: form }, env);
    expect(res.status).toBe(401);
  });
});
