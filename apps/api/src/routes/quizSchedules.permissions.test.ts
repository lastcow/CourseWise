/**
 * Quiz tester-schedule permission-shape tests that DO NOT require a database —
 * every route rejects unauthenticated callers before any DB query.
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

const QUIZ = '00000000-0000-0000-0000-000000000000';
const SCHED = '11111111-1111-1111-1111-111111111111';
const json = { 'content-type': 'application/json' };

describe('Quiz tester-schedule routes — unauthenticated rejections', () => {
  const cases: Array<[string, RequestInit]> = [
    [`/api/quizzes/${QUIZ}/schedules`, {}],
    [`/api/quizzes/${QUIZ}/schedules`, { method: 'POST', headers: json, body: '{}' }],
    [`/api/quizzes/${QUIZ}/schedules/${SCHED}`, { method: 'PATCH', headers: json, body: '{}' }],
    [`/api/quizzes/${QUIZ}/schedules/${SCHED}`, { method: 'DELETE' }],
    [
      `/api/quizzes/${QUIZ}/schedules/${SCHED}/members`,
      { method: 'PUT', headers: json, body: '{"studentIds":[]}' },
    ],
  ];

  for (const [path, init] of cases) {
    it(`${init.method ?? 'GET'} ${path} without auth → 401`, async () => {
      const res = await app.request(path, init, env);
      expect(res.status).toBe(401);
    });
  }
});
