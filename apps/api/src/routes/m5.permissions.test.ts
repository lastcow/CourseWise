/**
 * M5 permission-shape tests — exercise routes that reject before touching the DB.
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

describe('M5 routes — unauthenticated rejections', () => {
  const cases: Array<[string, RequestInit]> = [
    // Grading policy
    ['/api/courses/00000000-0000-0000-0000-000000000000/grading-policy', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/grading-policy',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    // Final grades
    ['/api/courses/00000000-0000-0000-0000-000000000000/final-grades', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/final-grades/recalculate',
      { method: 'POST' },
    ],
    [
      '/api/final-grades/00000000-0000-0000-0000-000000000000',
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/me/courses/00000000-0000-0000-0000-000000000000/final-grade', {}],
    ['/api/me/courses/00000000-0000-0000-0000-000000000000/gradebook-detail', {}],
    ['/api/courses/00000000-0000-0000-0000-000000000000/grades/export.csv', {}],
    // Alerts
    ['/api/courses/00000000-0000-0000-0000-000000000000/alerts', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/alerts',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/alerts/generate',
      { method: 'POST' },
    ],
    [
      '/api/alerts/00000000-0000-0000-0000-000000000000/resolve',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/me/alerts', {}],
    [
      '/api/me/alerts/00000000-0000-0000-0000-000000000000/read',
      { method: 'POST' },
    ],
    // Dashboards
    ['/api/dashboards/admin', {}],
    ['/api/dashboards/teacher', {}],
    ['/api/dashboards/student', {}],
  ];

  for (const [path, init] of cases) {
    it(`${init.method ?? 'GET'} ${path} without auth → 401`, async () => {
      const res = await app.request(path, init, env);
      expect(res.status).toBe(401);
    });
  }
});

describe('M5 routes — malformed JWT rejects', () => {
  it('rejects bad JWT on grading policy endpoint', async () => {
    const res = await app.request(
      '/api/courses/00000000-0000-0000-0000-000000000000/grading-policy',
      { headers: { authorization: 'Bearer not.a.jwt' } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
