/**
 * M4 permission-shape tests that DO NOT require a database connection — they
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

describe('M4 routes — unauthenticated rejections', () => {
  const cases: Array<[string, RequestInit]> = [
    ['/api/courses/00000000-0000-0000-0000-000000000000/quizzes', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/quizzes',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/quizzes/00000000-0000-0000-0000-000000000000', {}],
    ['/api/quizzes/00000000-0000-0000-0000-000000000000/questions', {}],
    [
      '/api/quizzes/00000000-0000-0000-0000-000000000000/questions',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/quiz-questions/00000000-0000-0000-0000-000000000000', {}],
    [
      '/api/quizzes/00000000-0000-0000-0000-000000000000/attempts',
      { method: 'POST' },
    ],
    ['/api/quiz-attempts/00000000-0000-0000-0000-000000000000', {}],
    [
      '/api/quiz-attempts/00000000-0000-0000-0000-000000000000/submit',
      { method: 'POST' },
    ],
    [
      '/api/quiz-answers/00000000-0000-0000-0000-000000000000/grade',
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/courses/00000000-0000-0000-0000-000000000000/attendance-sessions', {}],
    [
      '/api/courses/00000000-0000-0000-0000-000000000000/attendance-sessions',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/attendance-sessions/00000000-0000-0000-0000-000000000000', {}],
    ['/api/attendance-sessions/00000000-0000-0000-0000-000000000000/records', {}],
    [
      '/api/attendance-sessions/00000000-0000-0000-0000-000000000000/records',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ],
    ['/api/courses/00000000-0000-0000-0000-000000000000/attendance/export.csv', {}],
    ['/api/me/courses/00000000-0000-0000-0000-000000000000/attendance', {}],
  ];

  for (const [path, init] of cases) {
    it(`${init.method ?? 'GET'} ${path} without auth → 401`, async () => {
      const res = await app.request(path, init, env);
      expect(res.status).toBe(401);
    });
  }
});

describe('M4 routes — malformed JWT rejects', () => {
  it('rejects a missing-payload JWT on quizzes:read endpoints', async () => {
    const res = await app.request(
      '/api/courses/00000000-0000-0000-0000-000000000000/quizzes',
      { headers: { authorization: 'Bearer not.a.jwt' } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
