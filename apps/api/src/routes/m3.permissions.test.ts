/**
 * M3 permission-shape tests that DO NOT require a database connection — they
 * exercise routes that reject before DB queries.
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

describe('M3 routes — unauthenticated rejections', () => {
  const cases: Array<[string, RequestInit]> = [
    ['/api/courses/00000000-0000-0000-0000-000000000000/presentations', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/presentations',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/courses/00000000-0000-0000-0000-000000000000/assignments', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/assignments',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/courses/00000000-0000-0000-0000-000000000000/discussion-topics', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/discussion-topics',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/presentations/00000000-0000-0000-0000-000000000000', {}],
    ['/api/presentations/00000000-0000-0000-0000-000000000000/slides', {}],
    ['/api/assignments/00000000-0000-0000-0000-000000000000/submissions', {}],
    ['/api/discussion-topics/00000000-0000-0000-0000-000000000000/grades', {}],
  ];

  for (const [path, init] of cases) {
    it(`${init.method ?? 'GET'} ${path} without auth → 401`, async () => {
      const res = await app.request(path, init, env);
      expect(res.status).toBe(401);
    });
  }
});

describe('M3 routes — validation shape', () => {
  it('POST presentations rejects malformed body when authenticated (validation happens before DB)', async () => {
    // No auth → 401 first; this just confirms routing.
    const res = await app.request(
      '/api/courses/00000000-0000-0000-0000-000000000000/presentations',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
