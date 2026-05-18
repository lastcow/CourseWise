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

  it('POST /api/files/upload-url without auth → 401', async () => {
    const res = await app.request(
      '/api/files/upload-url',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('M2 — invitation-codes validate (public)', () => {
  it('rejects malformed bodies with 400', async () => {
    const res = await app.request(
      '/api/invitation-codes/validate',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('M2 — upload-url validates the request body shape', () => {
  it('validates mime allowlist (no DB query reached) — but auth required first', async () => {
    // Without auth this returns 401; we are just confirming routing is wired.
    const res = await app.request(
      '/api/files/upload-url',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          courseId: '11111111-2222-3333-4444-555555555555',
          fileName: 'evil.exe',
          mimeType: 'application/x-msdownload',
          fileSize: 1024,
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
